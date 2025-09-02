class FaceAttendanceSystem {
      constructor() {
        this.students = [];
        this.attendance = {};
        this.isDetecting = false;
        this.labeledDescriptors = [];
        this.faceMatcher = null;
        this.detectionLoopTimeout = null;
        this.isModelsLoaded = false;
        this.cameraAvailable = false;
        
        // Settings
        this.settings = {
          recognitionThreshold: 0.4, // Stricter default
          autoMarkAttendance: true,
        };
        
        // DOM elements
        this.initElements();
        
        // Initialize system
        this.init();
      }

      initElements() {
        // Loading elements
        this.loadingScreen = document.getElementById('loadingScreen');
        this.mainApp = document.getElementById('mainApp');
        this.progressFill = document.getElementById('progressFill');
        this.loadingText = document.getElementById('loadingText');
        
        // Video elements
        this.video = document.getElementById('video');
        this.overlay = document.getElementById('overlay');
        
        // Stats elements
        this.totalStudentsEl = document.getElementById('totalStudents');
        this.todayAttendanceEl = document.getElementById('todayAttendance');
        this.fpsCounterEl = document.getElementById('fpsCounter');
        this.attendanceRateEl = document.getElementById('attendanceRate');
        
        // Control elements
        this.studentNameInput = document.getElementById('studentName');
        this.registerBtn = document.getElementById('registerBtn');
        this.toggleCameraBtn = document.getElementById('toggleCamera');
        this.cameraToggleText = document.getElementById('cameraToggleText');
        
        // Status display
        this.statusEl = document.getElementById('status');
        
        // Settings
        this.autoAttendanceCheck = document.getElementById('autoAttendance');
        this.detectionThresholdSlider = document.getElementById('detectionThreshold');
        this.thresholdValue = document.getElementById('thresholdValue');
        
        // Attendance
        this.attendanceList = document.getElementById('attendanceList');
        this.searchAttendance = document.getElementById('searchAttendance');
        this.filterAttendance = document.getElementById('filterAttendance');
        
        // Action buttons
        this.exportDataBtn = document.getElementById('exportData');
        this.clearDataBtn = document.getElementById('clearData');
        this.downloadCsvBtn = document.getElementById('downloadCsv');
        this.importDataInput = document.getElementById('importData');
        this.cleanupBtn = document.getElementById('cleanupBtn');
        
        // Theme and modals
        this.themeToggle = document.getElementById('themeToggle');
        this.confirmModal = document.getElementById('confirmModal');
        this.toastContainer = document.getElementById('toastContainer');
        
        // Feedback
        this.registrationFeedback = document.getElementById('registrationFeedback');
      }

      async init() {
        try {
          await this.loadSystem();
          this.setupEventListeners();
          this.loadDataFromStorage(); 
          this.updateStats();
          this.updateLabeledDescriptors();
          if (this.cameraAvailable && this.isModelsLoaded) {
            this.startDetection();
          }
        } catch (error) {
          console.error('System initialization failed:', error);
          this.setStatus('System initialization failed. See console.', 'error');
          this.showMainApp();
        }
      }

      async loadSystem() {
        const loadingSteps = [
          { text: 'Loading face detection models...', progress: 30, action: () => this.loadModels() },
          { text: 'Initializing camera...', progress: 70, action: () => this.setupCamera() },
          { text: 'System ready!', progress: 100, action: () => this.sleep(200) }
        ];

        for (const step of loadingSteps) {
          this.loadingText.textContent = step.text;
          try {
            await step.action();
          } catch (err) {
            console.warn(`Step failed: ${step.text}`, err);
            this.setStatus(`${step.text} failed.`, 'error');
          }
          this.progressFill.style.width = `${step.progress}%`;
        }

        await this.sleep(300);
        this.showMainApp();
      }

      async loadModels() {
        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api/model/';
            await Promise.all([
                faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL),
                faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
                faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
            ]);
            this.isModelsLoaded = true;
            console.log('Face-api models loaded successfully.');
        } catch (error) {
            console.error('Failed to load face-api models:', error);
            this.isModelsLoaded = false;
            this.setStatus('Could not load face models. Recognition is disabled.', 'error');
            this.showToast('Failed to load face models.', 'error');
        }
      }

      async setupCamera() {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
              facingMode: 'user',
              width: { ideal: 640 },
              height: { ideal: 480 }
            }
          });
          
          this.video.srcObject = stream;
          this.cameraAvailable = true;
          
          await new Promise((resolve) => {
            this.video.onloadedmetadata = () => {
              this.setupCanvas();
              resolve();
            };
          });
          console.log('Camera initialized successfully');
        } catch (error) {
          console.warn('Camera initialization failed:', error);
          this.cameraAvailable = false;
          this.setupPlaceholderCamera();
          this.setStatus('Camera not available. Running in manual mode.', 'warning');
        }
      }

      setupPlaceholderCamera() {
        this.video.style.background = 'linear-gradient(45deg, #1e293b, #334155)';
        this.video.style.display = 'flex';
        this.video.style.alignItems = 'center';
        this.video.style.justifyContent = 'center';
        this.video.innerHTML = `
          <div style="text-align: center; color: white; font-family: var(--font-family-base);">
            <div style="font-size: 3rem; margin-bottom: 1rem;">📷</div>
            <div>Camera Not Available</div>
          </div>
        `;
      }

      setupCanvas() {
        if (!this.overlay) return;
        const displaySize = { width: this.video.clientWidth, height: this.video.clientHeight };
        faceapi.matchDimensions(this.overlay, displaySize);
      }

      showMainApp() {
        this.loadingScreen.style.opacity = '0';
        setTimeout(() => {
          this.loadingScreen.classList.add('hidden');
          this.mainApp.classList.remove('hidden');
        }, 500);
      }

      setupEventListeners() {
        this.registerBtn.addEventListener('click', () => this.registerStudent());
        this.toggleCameraBtn.addEventListener('click', () => this.toggleCamera());
        this.autoAttendanceCheck.addEventListener('change', (e) => this.settings.autoMarkAttendance = e.target.checked);
        this.detectionThresholdSlider.addEventListener('input', (e) => {
          this.settings.recognitionThreshold = parseFloat(e.target.value);
          this.thresholdValue.textContent = parseFloat(e.target.value).toFixed(2);
          this.updateLabeledDescriptors();
        });
        this.searchAttendance.addEventListener('input', () => this.renderAttendance());
        this.filterAttendance.addEventListener('change', () => this.renderAttendance());
        this.exportDataBtn.addEventListener('click', () => this.exportData());
        this.clearDataBtn.addEventListener('click', () => this.confirmClearData());
        this.downloadCsvBtn.addEventListener('click', () => this.downloadCsv());
        this.importDataInput.addEventListener('change', (e) => this.importData(e));
        this.themeToggle.addEventListener('click', () => this.toggleTheme());
        this.cleanupBtn.addEventListener('click', () => this.cleanupDuplicates());
        window.addEventListener('resize', () => this.setupCanvas());
      }

      updateLabeledDescriptors() {
        if (!this.isModelsLoaded || this.students.length === 0) {
            this.faceMatcher = null;
            return;
        }
        try {
            this.labeledDescriptors = this.students.map(student => {
                const descriptor = new Float32Array(Object.values(student.descriptor));
                return new faceapi.LabeledFaceDescriptors(student.name, [descriptor]);
            });
            this.faceMatcher = new faceapi.FaceMatcher(this.labeledDescriptors, this.settings.recognitionThreshold);
            console.log('Face matcher updated.');
        } catch(e) {
            console.error("Error creating face matcher:", e);
            this.setStatus("Error updating face data.", "error");
        }
      }

      startDetection() {
        if (this.isDetecting || !this.cameraAvailable || !this.isModelsLoaded) return;
        this.isDetecting = true;
        this.toggleCameraBtn.classList.remove('btn--primary');
        this.toggleCameraBtn.classList.add('btn--secondary');
        this.cameraToggleText.textContent = 'Pause';
        this.setStatus('Starting recognition...', 'info');
        this.performRecognition();
      }

      stopDetection() {
        this.isDetecting = false;
        clearTimeout(this.detectionLoopTimeout);
        this.toggleCameraBtn.classList.remove('btn--secondary');
        this.toggleCameraBtn.classList.add('btn--primary');
        this.cameraToggleText.textContent = 'Resume';
        this.setStatus('Detection paused.', 'warning');
        this.clearOverlay();
      }

      async performRecognition() {
        if (!this.isDetecting) return;

        if (this.video.paused || this.video.ended || !this.faceMatcher) {
            this.detectionLoopTimeout = setTimeout(() => this.performRecognition(), 2000);
            return;
        }

        const displaySize = { width: this.video.clientWidth, height: this.video.clientHeight };
        if(displaySize.width === 0 || displaySize.height === 0) {
            this.detectionLoopTimeout = setTimeout(() => this.performRecognition(), 1000);
            return;
        }
        faceapi.matchDimensions(this.overlay, displaySize);
        const ctx = this.overlay.getContext('2d');
        ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);

        const detections = await faceapi.detectAllFaces(this.video, new faceapi.TinyFaceDetectorOptions())
            .withFaceLandmarks().withFaceDescriptors();
        
        const resizedDetections = faceapi.resizeResults(detections, displaySize);

        if (resizedDetections.length === 0) {
            this.setStatus('Scanning for faces...', 'info');
        }

        let unknownFaceDetected = false;
        resizedDetections.forEach(detection => {
            const box = detection.detection.box;
            const match = this.faceMatcher.findBestMatch(detection.descriptor);
            
            if (match.label === 'unknown') {
                ctx.strokeStyle = '#ff4757'; // Red
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
                ctx.fillStyle = '#ff4757';
                ctx.fillRect(box.x, box.y - 20, 130, 20);
                ctx.fillStyle = 'white';
                ctx.font = '14px Arial';
                ctx.fillText('NOT REGISTERED', box.x + 5, box.y - 5);
                unknownFaceDetected = true;
            } else {
                ctx.strokeStyle = '#2ed573'; // Green
                ctx.lineWidth = 2;
                ctx.strokeRect(box.x, box.y, box.width, box.height);
                ctx.fillStyle = '#2ed573';
                const labelWidth = ctx.measureText(match.label).width + 10;
                ctx.fillRect(box.x, box.y - 20, labelWidth, 20);
                ctx.fillStyle = 'white';
                ctx.font = '14px Arial';
                ctx.fillText(match.label, box.x + 5, box.y - 5);
                
                if (this.settings.autoMarkAttendance) {
                    this.markAttendance(match.label, match.distance);
                }
                this.setStatus(`Recognized: ${match.label}`, 'success');
            }
        });

        if (unknownFaceDetected) {
            this.setStatus('Unknown face detected. Enter name and register.', 'warning');
        }

        this.detectionLoopTimeout = setTimeout(() => this.performRecognition(), 2000);
      }

      clearOverlay() {
        if (!this.overlay) return;
        const ctx = this.overlay.getContext('2d');
        ctx?.clearRect(0, 0, this.overlay.width, this.overlay.height);
      }

      async registerStudent() {
        const name = this.studentNameInput.value.trim();
        if (!name) {
            this.showToast('Please enter a name', 'warning');
            return;
        }
        if (this.students.some(s => s.name.toLowerCase() === name.toLowerCase())) {
            this.setStatus('Student with this name already exists', 'warning');
            return;
        }

        if (!this.cameraAvailable || !this.isModelsLoaded) {
            this.showToast('Camera or face models not ready for registration.', 'error');
            return;
        }

        this.setButtonLoading(this.registerBtn, true);
        this.setStatus(`Detecting face for ${name}...`, 'info');

        let bestDescriptor = null;
        for (let i = 0; i < 5; i++) {
            const result = await faceapi.detectSingleFace(this.video, new faceapi.TinyFaceDetectorOptions())
                .withFaceLandmarks().withFaceDescriptor();
            if (result && result.detection.score > 0.8) {
                bestDescriptor = result.descriptor;
                break;
            }
            await this.sleep(300);
        }

        if (!bestDescriptor) {
            this.setStatus('Could not get a clear face. Try again.', 'error');
            this.setButtonLoading(this.registerBtn, false);
            return;
        }

        const student = {
            name,
            id: crypto.randomUUID(),
            descriptor: Array.from(bestDescriptor),
            registeredAt: new Date().toISOString()
        };

        this.students.push(student);
        this.updateLabeledDescriptors();
        this.updateStats();
        this.saveDataToStorage();

        this.setStatus(`✅ Registered ${name} successfully`, 'success');
        this.showToast(`${name} registered successfully!`);
        this.studentNameInput.value = '';
        this.studentNameInput.placeholder = 'Enter full name';
        this.setButtonLoading(this.registerBtn, false);
      }

      markAttendance(name, confidence) {
        const today = this.getTodayDate();
        if (!this.attendance[today]) this.attendance[today] = [];
        if (this.attendance[today].some(record => record.name === name)) return;

        this.attendance[today].push({
            name,
            time: new Date().toLocaleTimeString(),
            confidence: 1 - confidence 
        });

        this.renderAttendance();
        this.updateStats();
        this.saveDataToStorage();
        this.showAttendanceConfirmation(name);
      }

      toggleCamera() {
        if (this.isDetecting) {
          this.stopDetection();
        } else {
          this.startDetection();
        }
      }

      renderAttendance() {
        if (!this.attendanceList) return;
        
        const today = this.getTodayDate();
        const todayAttendance = this.attendance[today] || [];
        const searchTerm = this.searchAttendance?.value.toLowerCase() || '';
        const filter = this.filterAttendance?.value || 'all';

        let displayedRecords;

        if (filter === 'absent') {
            const presentNames = new Set(todayAttendance.map(r => r.name));
            displayedRecords = this.students
                .filter(student => !presentNames.has(student.name))
                .map(student => ({ name: student.name, time: 'Absent', confidence: 0 }));
        } else {
            displayedRecords = [...todayAttendance];
        }

        if (searchTerm) {
            displayedRecords = displayedRecords.filter(record =>
                record.name.toLowerCase().includes(searchTerm)
            );
        }
        
        if (filter === 'present' && searchTerm) {
             displayedRecords = todayAttendance.filter(record =>
                record.name.toLowerCase().includes(searchTerm)
            );
        } else if (filter === 'present') {
            displayedRecords = [...todayAttendance];
        }


        if (displayedRecords.length === 0) {
            this.attendanceList.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon">📝</div>
                <p>No records match your filter</p>
                <span>Try changing the search or filter options.</span>
            </div>
            `;
            return;
        }

        this.attendanceList.innerHTML = displayedRecords.map(record => `
            <div class="attendance-item">
            <div class="student-info">
                <div class="student-avatar" style="background-color: ${record.time === 'Absent' ? 'var(--color-warning)' : 'var(--color-primary)'};">
                ${record.name.charAt(0).toUpperCase()}
                </div>
                <div class="student-details">
                <h4>${record.name}</h4>
                ${record.time !== 'Absent' ? `<p>Confidence: ${Math.round(record.confidence * 100)}%</p>` : '<p>Status: Absent</p>'}
                </div>
            </div>
            <div class="attendance-time">
                ${record.time}
            </div>
            </div>
        `).join('');
      }

      updateStats() {
        if (this.totalStudentsEl) this.totalStudentsEl.textContent = this.students.length;
        const today = this.getTodayDate();
        const todayCount = this.attendance[today] ? this.attendance[today].length : 0;
        if (this.todayAttendanceEl) this.todayAttendanceEl.textContent = todayCount;
        const attendanceRate = this.students.length > 0 ? Math.round((todayCount / this.students.length) * 100) : 0;
        if (this.attendanceRateEl) this.attendanceRateEl.textContent = `${attendanceRate}%`;
      }

      saveDataToStorage() {
        try {
            localStorage.setItem('faceAttendance_students', JSON.stringify(this.students));
            localStorage.setItem('faceAttendance_attendance', JSON.stringify(this.attendance));
        } catch (e) {
            console.warn('Could not save data to localStorage', e);
        }
      }

      loadDataFromStorage() {
        try {
            const storedStudents = localStorage.getItem('faceAttendance_students');
            const storedAttendance = localStorage.getItem('faceAttendance_attendance');
            if (storedStudents) this.students = JSON.parse(storedStudents);
            if (storedAttendance) this.attendance = JSON.parse(storedAttendance);
            this.renderAttendance();
        } catch (e) {
            console.warn('Could not load data from localStorage', e);
            this.students = [];
            this.attendance = {};
        }
      }

      exportData() {
        const data = {
          students: this.students,
          attendance: this.attendance,
          exportedAt: new Date().toISOString()
        };
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-data-${this.getTodayDate()}.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('Data exported successfully', 'success');
      }

      downloadCsv() {
        let csv = 'Date,Name,Time,Confidence\n';
        Object.keys(this.attendance).forEach(date => {
          this.attendance[date].forEach(record => {
            csv += `${date},"${record.name}",${record.time},${record.confidence.toFixed(2)}\n`;
          });
        });
        const blob = new Blob([csv], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-${this.getTodayDate()}.csv`;
        a.click();
        URL.revokeObjectURL(url);
        this.showToast('CSV downloaded successfully', 'success');
      }

      confirmClearData() {
        this.showConfirmDialog(
          'Clear All Data',
          'Are you sure you want to clear all students and attendance data? This action cannot be undone.',
          () => this.clearAllData()
        );
      }

      clearAllData() {
        this.students = [];
        this.attendance = {};
        this.updateLabeledDescriptors();
        this.saveDataToStorage();
        this.renderAttendance();
        this.updateStats();
        this.showToast('All data cleared successfully', 'success');
      }

      importData(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
          try {
            const data = JSON.parse(e.target.result);
            if (data.students && Array.isArray(data.students)) this.students = data.students;
            if (data.attendance && typeof data.attendance === 'object') this.attendance = data.attendance;
            this.updateLabeledDescriptors();
            this.saveDataToStorage();
            this.renderAttendance();
            this.updateStats();
            this.showToast('Data imported successfully', 'success');
          } catch (error) {
            this.showToast('Failed to import data. Invalid file format.', 'error');
          }
        };
        reader.readAsText(file);
        event.target.value = '';
      }

      toggleTheme() {
        const currentScheme = document.documentElement.getAttribute('data-color-scheme') || 'light';
        const newScheme = currentScheme === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-color-scheme', newScheme);
        const themeIcon = this.themeToggle.querySelector('.theme-icon');
        if (themeIcon) themeIcon.textContent = newScheme === 'dark' ? '☀️' : '🌙';
        try {
          localStorage.setItem('theme', newScheme);
        } catch (e) { console.warn('Could not save theme preference'); }
      }

      setButtonLoading(button, loading) {
        if (!button) return;
        const text = button.querySelector('.btn-text');
        const loader = button.querySelector('.btn-loader');
        if (text && loader) {
            text.classList.toggle('hidden', loading);
            loader.classList.toggle('hidden', !loading);
            button.disabled = loading;
        }
      }

      showToast(message, type = 'info') {
        if (!this.toastContainer) return;
        const toast = document.createElement('div');
        toast.className = `toast ${type}`;
        const icons = { success: '✅', error: '❌', warning: '⚠️', info: 'ℹ️' };
        toast.innerHTML = `
          <div class="toast-icon">${icons[type] || icons.info}</div>
          <div class="toast-content">
            <h4>${type.charAt(0).toUpperCase() + type.slice(1)}</h4>
            <p>${message}</p>
          </div>
          <button class="toast-close">×</button>
        `;
        toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
        this.toastContainer.appendChild(toast);
        setTimeout(() => { toast.remove(); }, 5000);
      }

      showConfirmDialog(title, message, onConfirm) {
        if (!this.confirmModal) return;
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        const okBtn = document.getElementById('confirmOk');
        const cancelBtn = document.getElementById('confirmCancel');
        
        const handleOk = () => {
            this.confirmModal.classList.add('hidden');
            onConfirm();
            cleanup();
        };
        const handleCancel = () => {
            this.confirmModal.classList.add('hidden');
            cleanup();
        };
        const cleanup = () => {
            okBtn.removeEventListener('click', handleOk);
            cancelBtn.removeEventListener('click', handleCancel);
        };

        okBtn.addEventListener('click', handleOk);
        cancelBtn.addEventListener('click', handleCancel);
        this.confirmModal.classList.remove('hidden');
      }

      getTodayDate() {
        return new Date().toISOString().split('T')[0];
      }

      sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
      }

      setStatus(text, type = 'info') {
        if (!this.statusEl) return;
        this.statusEl.textContent = text;
        const colors = {
            error: 'var(--color-error)',
            success: 'var(--color-success)',
            info: 'var(--color-info)',
            warning: 'var(--color-warning)',
        };
        this.statusEl.style.color = colors[type] || 'var(--color-text)';
        this.statusEl.style.animation = (type === 'error' || type === 'warning') ? 'pulse 1s ease-in-out 2' : 'none';
      }

      showAttendanceConfirmation(studentName) {
        const confirmationDiv = document.createElement('div');
        confirmationDiv.className = 'attendance-confirmation';
        confirmationDiv.innerHTML = `
            <div class="confirmation-card">
                <h3>✅ Attendance Recorded</h3>
                <p><strong>${studentName}</strong></p>
                <p>Time: ${new Date().toLocaleTimeString()}</p>
            </div>
        `;
        document.body.appendChild(confirmationDiv);
        setTimeout(() => {
            confirmationDiv.style.animation = 'slideOut 0.3s ease-in forwards';
            setTimeout(() => { confirmationDiv.remove(); }, 300);
        }, 3000);
      }

      async cleanupDuplicates() {
        if (this.students.length < 2) {
            this.showToast('Not enough students to check for duplicates.', 'info');
            return;
        }
        this.setStatus('Checking for duplicates...', 'info');
        await this.sleep(100);

        const duplicateThreshold = 0.35;
        const toRemoveIds = new Set();
        const studentsCopy = [...this.students];

        for (let i = 0; i < studentsCopy.length; i++) {
            if (toRemoveIds.has(studentsCopy[i].id)) continue;
            for (let j = i + 1; j < studentsCopy.length; j++) {
                if (toRemoveIds.has(studentsCopy[j].id)) continue;

                const desc1 = new Float32Array(Object.values(studentsCopy[i].descriptor));
                const desc2 = new Float32Array(Object.values(studentsCopy[j].descriptor));
                const distance = faceapi.euclideanDistance(desc1, desc2);

                if (distance < duplicateThreshold) {
                    const studentToRemove = studentsCopy[j];
                    const keep = await new Promise(resolve => {
                        this.showConfirmDialog(
                            'Duplicate Detected',
                            `"${studentsCopy[i].name}" and "${studentToRemove.name}" seem to be the same person. Remove "${studentToRemove.name}"?`,
                            () => resolve(true),
                            () => resolve(false) // Add a cancel callback
                        );
                    });

                    if (keep) {
                        toRemoveIds.add(studentToRemove.id);
                    }
                }
            }
        }
        
        if (toRemoveIds.size > 0) {
            this.students = this.students.filter(s => !toRemoveIds.has(s.id));
            this.updateLabeledDescriptors();
            this.saveDataToStorage();
            this.renderAttendance();
            this.showToast(`Removed ${toRemoveIds.size} duplicate(s).`, 'success');
        } else {
            this.showToast('No duplicates found.', 'success');
        }
        this.setStatus('Duplicate check complete.', 'success');
      }
    }

    // Initialize the system when DOM is loaded
    document.addEventListener('DOMContentLoaded', () => {
      try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme) {
            document.documentElement.setAttribute('data-color-scheme', savedTheme);
            const themeIcon = document.querySelector('#themeToggle .theme-icon');
            if(themeIcon) themeIcon.textContent = savedTheme === 'dark' ? '☀️' : '🌙';
        }
      } catch (e) { /* ignore */ }
      
      window.faceSystem = new FaceAttendanceSystem();
    });

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
      if (window.faceSystem) {
        if (document.hidden) {
          window.faceSystem.stopDetection();
        } else {
          window.faceSystem.startDetection();
        }
      }
    });
    /* --- END: JAVASCRIPT LOGIC --- */
// Main JavaScript for NYRP Staff Dashboard

document.addEventListener('DOMContentLoaded', function() {
    // Sidebar toggle functionality
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const sidebar = document.querySelector('.sidebar');
    const mainContent = document.querySelector('.main-content');
    
    if (sidebarToggle) {
        sidebarToggle.addEventListener('click', function() {
            sidebar.classList.toggle('active');
            
            // Check if sidebar is active (visible on mobile)
            if (sidebar.classList.contains('active')) {
                mainContent.style.marginLeft = '0';
            } else {
                // Check viewport width to determine margin
                if (window.innerWidth <= 992) {
                    mainContent.style.marginLeft = '0';
                } else {
                    mainContent.style.marginLeft = 'var(--sidebar-width)';
                }
            }
        });
    }
    
    // Handle window resize for sidebar
    window.addEventListener('resize', function() {
        if (window.innerWidth > 992) {
            sidebar?.classList.remove('active');
            if (mainContent) mainContent.style.marginLeft = 'var(--sidebar-width)';
        } else {
            if (mainContent) mainContent.style.marginLeft = '0';
        }
    });

    // Initialize tooltips
    const tooltipTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="tooltip"]'));
    tooltipTriggerList.forEach(function (tooltipTriggerEl) {
        new bootstrap.Tooltip(tooltipTriggerEl);
    });

    // Initialize popovers
    const popoverTriggerList = [].slice.call(document.querySelectorAll('[data-bs-toggle="popover"]'));
    popoverTriggerList.forEach(function (popoverTriggerEl) {
        new bootstrap.Popover(popoverTriggerEl);
    });

    // Staff search functionality
    const staffSearch = document.getElementById('staffSearch');
    if (staffSearch) {
        staffSearch.addEventListener('input', function() {
            const searchTerm = this.value.toLowerCase();
            const staffRows = document.querySelectorAll('table tbody tr');
            
            staffRows.forEach(row => {
                const staffName = row.querySelector('td:first-child').textContent.toLowerCase();
                const staffRole = row.querySelector('td:nth-child(2)')?.textContent.toLowerCase() || '';
                
                if (staffName.includes(searchTerm) || staffRole.includes(searchTerm)) {
                    row.style.display = '';
                } else {
                    row.style.display = 'none';
                }
            });
        });
    }

    // Form validation
    const forms = document.querySelectorAll('.needs-validation');
    Array.from(forms).forEach(form => {
        form.addEventListener('submit', event => {
            if (!form.checkValidity()) {
                event.preventDefault();
                event.stopPropagation();
            }
            form.classList.add('was-validated');
        }, false);
    });

    // Theme switcher
    const themeSelect = document.getElementById('theme');
    if (themeSelect) {
        // Load saved theme
        const savedTheme = localStorage.getItem('dashboard-theme') || 'light';
        themeSelect.value = savedTheme;
        applyTheme(savedTheme);
        
        // Theme change handler
        themeSelect.addEventListener('change', function() {
            const theme = this.value;
            localStorage.setItem('dashboard-theme', theme);
            applyTheme(theme);
        });
    }

    // Apply theme function
    function applyTheme(theme) {
        const body = document.body;
        body.classList.remove('theme-light', 'theme-dark');
        
        if (theme === 'system') {
            const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
            body.classList.add(prefersDark ? 'theme-dark' : 'theme-light');
        } else {
            body.classList.add(`theme-${theme}`);
        }
    }

    // Charts initialization (if any chart elements exist)
    const activityChartEl = document.getElementById('activityChart');
    if (activityChartEl) {
        initActivityChart(activityChartEl);
    }
    
    // Initialize activity chart
    function initActivityChart(canvas) {
        // This is a placeholder - you would use a library like Chart.js
        console.log('Activity chart would be initialized here');
        // Example with Chart.js:
        // new Chart(canvas, { 
        //     type: 'line',
        //     data: { ... },
        //     options: { ... }
        // });
    }

    // Handle notification clicks
    const notificationBtns = document.querySelectorAll('.notification-btn');
    notificationBtns.forEach(btn => {
        btn.addEventListener('click', function() {
            // You could mark notifications as read here
            const badge = this.querySelector('.notification-badge');
            if (badge) {
                badge.style.display = 'none';
            }
        });
    });
}); 
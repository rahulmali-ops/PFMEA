// auth.js - Include this at the top of every protected page

(function() {
  'use strict';

  // Check if user is authenticated
  function checkAuth() {
    const currentUser = localStorage.getItem('pfmea_current_user');
    const sessionExpiry = localStorage.getItem('pfmea_session_expiry');

    if (!currentUser || !sessionExpiry) {
      redirectToLogin();
      return null;
    }

    if (new Date().getTime() > parseInt(sessionExpiry)) {
      logout('Session expired. Please login again.');
      return null;
    }

    return JSON.parse(currentUser);
  }

  function redirectToLogin() {
    window.location.href = 'login.html';
  }

  function logout(message) {
    localStorage.removeItem('pfmea_current_user');
    localStorage.removeItem('pfmea_session_expiry');
    
    if (message) {
      localStorage.setItem('pfmea_login_message', message);
    }
    
    redirectToLogin();
  }

  function hasPermission(requiredRole) {
    const user = checkAuth();
    if (!user) return false;

    const roleHierarchy = {
      'viewer': 1,
      'engineer': 2,
      'admin': 3
    };

    return roleHierarchy[user.role] >= roleHierarchy[requiredRole];
  }

  function displayUserInfo() {
    const user = checkAuth();
    if (!user) return;

    // Hide User Management link for non-admins
    const userMgmtLink = document.getElementById('userMgmtLink');
    if (userMgmtLink && user.role !== 'admin') {
      userMgmtLink.style.display = 'none';
    }

    // Display in header-info (for pages with header-info div)
    const userInfoElement = document.getElementById('userInfo');
    if (userInfoElement) {
      userInfoElement.innerHTML = `
        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="text-align: right;">
            <div style="font-size: 13px; font-weight: 600;">${user.fullName}</div>
            <div style="font-size: 11px; opacity: 0.8;">${user.role.toUpperCase()} • ${user.department}</div>
          </div>
        </div>
      `;
    }

    // Display in navbar user info (for pages with userInfoDisplay div)
    const userInfoDisplay = document.getElementById('userInfoDisplay');
    if (userInfoDisplay) {
      userInfoDisplay.style.display = 'flex';
      userInfoDisplay.style.alignItems = 'center';
      userInfoDisplay.style.gap = '12px';
      userInfoDisplay.style.color = '#fff';
      userInfoDisplay.innerHTML = `
        <div style="text-align: right; padding: 8px 12px; background: rgba(255,255,255,0.1); border-radius: 6px;">
          <div style="font-size: 13px; font-weight: 600;">${user.fullName}</div>
          <div style="font-size: 11px; opacity: 0.9;">${user.role.toUpperCase()}</div>
        </div>
      `;
    }
  }

  // Make logout function global
  window.logoutUser = function() {
    if (confirm('Are you sure you want to logout?')) {
      // Log the logout activity
      const user = checkAuth();
      if (user) {
        const activities = JSON.parse(localStorage.getItem('pfmea_activities') || '[]');
        activities.push({
          action: 'logout',
          username: user.username,
          timestamp: new Date().toISOString(),
          ip: 'Local'
        });
        localStorage.setItem('pfmea_activities', JSON.stringify(activities));
      }
      
      logout();
    }
  };

  // Make permission check global
  window.hasPermission = hasPermission;

  // Initialize auth check
  const user = checkAuth();
  if (user) {
    displayUserInfo();
  }

  // Export user data globally
  window.currentUser = user;

})();
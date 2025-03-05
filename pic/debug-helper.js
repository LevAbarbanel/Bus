// debug-helper.js
// Add this as an additional script in your extension to help diagnose issues

// Log Chrome extension version and permissions
console.log("Chrome Extension Diagnostic Helper");
console.log("Extension ID:", chrome.runtime.id);

// Check extension permissions
function checkPermissions() {
  const permissionsToCheck = {
    permissions: ['storage', 'alarms', 'scripting', 'tabs'],
    origins: ['https://moovitapp.com/*']
  };
  
  chrome.permissions.contains(permissionsToCheck, (result) => {
    console.log("Permission check result:", result);
    if (result) {
      console.log("✅ All permissions granted");
    } else {
      console.error("❌ Missing some permissions");
      
      // Check individual permissions
      ['storage', 'alarms', 'scripting', 'tabs'].forEach(permission => {
        chrome.permissions.contains({permissions: [permission]}, (hasPermission) => {
          console.log(`Permission '${permission}': ${hasPermission ? '✅' : '❌'}`);
        });
      });
      
      // Check origin permission
      chrome.permissions.contains({origins: ['https://moovitapp.com/*']}, (hasPermission) => {
        console.log(`Permission for 'https://moovitapp.com/*': ${hasPermission ? '✅' : '❌'}`);
      });
    }
  });
}

// Check if data exists in storage
function checkStorage() {
  chrome.storage.local.get(null, (data) => {
    console.log("Current storage data:", data);
    if (Object.keys(data).length === 0) {
      console.log("⚠️ Storage is empty");
    } else {
      console.log("✅ Data found in storage");
      
      // Check if we have route data
      if (data.moovitRouteData) {
        console.log(`Found ${data.moovitRouteData.routes?.length || 0} routes in storage`);
        
        // Log a sample route if available
        if (data.moovitRouteData.routes && data.moovitRouteData.routes.length > 0) {
          console.log("Sample route:", data.moovitRouteData.routes[0]);
        }
      } else {
        console.error("❌ No moovitRouteData found in storage");
      }
      
      // Check timestamp
      if (data.lastUpdateTimestamp) {
        const lastUpdate = new Date(data.lastUpdateTimestamp);
        const now = new Date();
        const ageMinutes = (now - lastUpdate) / (1000 * 60);
        
        console.log(`Last update: ${lastUpdate.toLocaleString()} (${ageMinutes.toFixed(1)} minutes ago)`);
        
        if (ageMinutes > 5) {
          console.warn("⚠️ Data may be stale (last updated more than 5 minutes ago)");
        }
      }
    }
  });
}

// Monitor background activity
function monitorBackgroundActivity() {
  // Check if alarms are set
  chrome.alarms.getAll((alarms) => {
    console.log("Current alarms:", alarms);
    
    const fetchAlarm = alarms.find(a => a.name === 'fetchDataAlarm');
    if (fetchAlarm) {
      console.log("✅ Fetch alarm is set");
      
      // Calculate when it will next trigger
      const nextTrigger = new Date(fetchAlarm.scheduledTime);
      console.log(`Next trigger: ${nextTrigger.toLocaleTimeString()}`);
    } else {
      console.error("❌ Fetch alarm is not set");
    }
  });
}

// Run all checks
function runDiagnostics() {
  console.log("Running diagnostics...");
  
  checkPermissions();
  checkStorage();
  monitorBackgroundActivity();
  
  console.log("Diagnostics complete");
}

// Run diagnostics when this script loads
runDiagnostics();

// Expose diagnostic function globally for manual running
window.runDiagnostics = runDiagnostics;

// Add a button to the popup to run diagnostics


// Add diagnostics button if we're in the popup

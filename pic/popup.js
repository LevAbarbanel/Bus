// DOM elements
const routesContainer = document.getElementById('routes-container');
const updateTimeElement = document.getElementById('update-time');
const refreshButton = document.getElementById('refresh-button');

// Show loading state
function showLoading() {
  console.log("Showing loading state");
  routesContainer.innerHTML = '<div class="loading">טוען נתונים</div>';
}

// Show error state
function showError(message) {
  console.log("Showing error:", message);
  routesContainer.innerHTML = `
    <div class="error">
      <h2>שגיאה בטעינת המידע</h2>
      <p>${message || 'אירעה שגיאה לא צפויה בעת טעינת הנתונים'}</p>
    </div>
  `;
}

// Add animation classes based on time to arrival
function getArrivalClass(minutes) {
  if (minutes <= 5) {
    return 'arriving-very-soon';  // Less than 5 minutes
  } else if (minutes <= 10) {
    return 'arriving-soon';  // 5-10 minutes
  }
  return '';  // Default
}

// Parse time (HH:MM) and calculate difference in minutes
function calculateMinutesDifference(timeStr) {
  try {
    // Extract hours and minutes from the time string (format: "20:48")
    const [hours, minutes] = timeStr.split(':').map(part => parseInt(part, 10));
    
    // Create a date object for today with the given time
    const targetTime = new Date();
    targetTime.setHours(hours, minutes, 0, 0);
    
    // Get current time
    const now = new Date();
    
    // Calculate difference in minutes
    const diffMs = targetTime - now;
    const diffMinutes = Math.ceil(diffMs / (1000 * 60));
    
    return diffMinutes > 0 ? diffMinutes : null;
  } catch (e) {
    console.error("Error calculating time difference:", e);
    return null;
  }
}

// Format date in Hebrew format
function formatHebrewDateTime(dateStr) {
  try {
    const date = new Date(dateStr);
    
    // Format as HH:MM DD/MM
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const day = date.getDate().toString().padStart(2, '0');
    const month = (date.getMonth() + 1).toString().padStart(2, '0');
    
    return `${hours}:${minutes} ${day}/${month}`;
  } catch (e) {
    console.error("Error formatting date:", e);
    return dateStr; // Return the original string if there's an error
  }
}

// Update the last updated time display
function updateTimeDisplay(timestamp) {
  try {
    if (!timestamp) {
      timestamp = new Date().toISOString();
    }
    
    const formattedTime = formatHebrewDateTime(timestamp);
    updateTimeElement.textContent = 'עודכן לאחרונה: ' + formattedTime;
    console.log("Updated time display to:", formattedTime);
  } catch (e) {
    console.error("Error updating time display:", e);
    updateTimeElement.textContent = 'עודכן לאחרונה: ' + new Date().toLocaleString();
  }
}

// Store the latest data
let currentData = null;

// Recalculate waiting times and update display without fetching new data
function updateWaitingTimes() {
  if (!currentData || !currentData.routes) {
    return; // No data to update
  }
  
  // Recalculate minutes for all routes
  currentData.routes.forEach(route => {
    // If we have a departure time, recalculate the waiting time
    if (route.departureTime) {
      const minutesToDeparture = calculateMinutesDifference(route.departureTime);
      if (minutesToDeparture !== null && minutesToDeparture > 0) {
        route.calculatedMinutes = minutesToDeparture;
      } else {
        // If time has passed, remove the calculated minutes
        delete route.calculatedMinutes;
      }
    }
  });
  
  // Re-sort and redisplay the data
  displayRoutes(currentData, true);
}

// Fix for data display issues
function fixDataForDisplay(route) {
  // Ensure proper format for the station display
  if (route.station && route.station.includes("מתחנת")) {
    route.station = route.station.replace("מתחנת", "").trim();
  }
  
  // If we have details but no station, try to extract station
  if (!route.station && route.details && route.details.length > 0) {
    for (const detail of route.details) {
      if (detail.includes("מתחנת")) {
        route.station = detail.split("מתחנת")[1].trim();
        break;
      }
    }
  }
  
  // Clean up ETA display
  if (route.eta && typeof route.eta === 'string') {
    // Make sure it has the דק' suffix
    if (!route.eta.includes("דק'") && !route.eta.includes("דק׳")) {
      route.eta = route.eta + " דק'";
    }
  }
  
  return route;
}

// Display the routes data
function displayRoutes(data, isUpdate = false) {
  console.log("Displaying routes data:", data);
  
  // Store the current data for future updates
  if (!isUpdate) {
    currentData = JSON.parse(JSON.stringify(data)); // Deep copy
  }
  
  // Clear previous content
  routesContainer.innerHTML = '';
  
  // Update timestamp from lastUpdated property if available, or use timestamp
  if (!isUpdate) {
    updateTimeDisplay(data.lastUpdated || data.timestamp);
  } else {
    // For updates, show the current time
    updateTimeDisplay(new Date().toISOString());
  }
  
  // Check if we have routes
  if (!data.routes || data.routes.length === 0) {
    console.log("No routes found in data");
    routesContainer.innerHTML = `
      <div class="error">
        <h2>לא נמצאו מסלולים</h2>
        <p>לא נמצאו מסלולים זמינים כרגע.</p>
      </div>
    `;
    return;
  }
  
  console.log(`Found ${data.routes.length} routes to display`);
  
  // Process each route
  data.routes.forEach(route => {
    // Fix data format issues
    route = fixDataForDisplay(route);
    
    // If we have a departure time, always try to calculate the waiting time
    if (route.departureTime) {
      const minutesToDeparture = calculateMinutesDifference(route.departureTime);
      if (minutesToDeparture !== null && minutesToDeparture > 0) {
        route.calculatedMinutes = minutesToDeparture;
      }
    }
  });
  
  // Sort routes by waiting time (ETA or calculated minutes)
  data.routes.sort((a, b) => {
    // First by ETA if available
    if (a.etaMinutes !== undefined && b.etaMinutes !== undefined) {
      return a.etaMinutes - b.etaMinutes;
    }
    
    // Then by calculated minutes
    if (a.calculatedMinutes !== undefined && b.calculatedMinutes !== undefined) {
      return a.calculatedMinutes - b.calculatedMinutes;
    }
    
    // ETA takes precedence over calculated minutes
    if (a.etaMinutes !== undefined) return -1;
    if (b.etaMinutes !== undefined) return 1;
    
    // Then calculated minutes
    if (a.calculatedMinutes !== undefined) return -1;
    if (b.calculatedMinutes !== undefined) return 1;
    
    // Fall back to departure time if available
    if (a.departureTime && b.departureTime) {
      return a.departureTime.localeCompare(b.departureTime);
    }
    
    return 0;
  });
  
  // Display each route
  data.routes.forEach((route, index) => {
    console.log(`Processing route ${index+1}:`, route);
    
    const routeElement = document.createElement('div');
    routeElement.className = 'route-container';
    
    // Add animation delay based on index
    routeElement.style.animationDelay = `${index * 0.1}s`;
    
    // Create route header
    let routeHTML = `
      <div class="route-header">
        <div class="lines">
          ${route.lines && route.lines.length > 0 ? 
            route.lines.map(line => `<div class="line">${line}</div>`).join('') : 
            '<div class="line">?</div>'}
        </div>
        <div class="duration">${route.duration || ''}</div>
      </div>
    `;
    
    // Add station information prominently if available
    if (route.station) {
      routeHTML += `<div class="station-info">${route.station}</div>`;
    }
    
    // Add arrival and ETA information in a prominent way
    let hasETAorDeparture = false;
    let arrivalClass = '';
    let etaMinutes = 0;
    
    // Determine what kind of arrival time we have and set class accordingly
    if (route.etaMinutes) {
      etaMinutes = route.etaMinutes;
      arrivalClass = getArrivalClass(etaMinutes);
      hasETAorDeparture = true;
    } else if (route.calculatedMinutes) {
      etaMinutes = route.calculatedMinutes;
      arrivalClass = getArrivalClass(etaMinutes);
      hasETAorDeparture = true;
    } else if (route.departureTime) {
      // We have a departure time, so we consider that we have departure info
      hasETAorDeparture = true;
    }
    
    routeHTML += `<div class="arrival-info ${arrivalClass}">`;
    
    // Real-time ETA has highest priority
    if (route.eta) {
      routeHTML += `<div class="eta">יוצא בעוד <span class="eta-time">${route.eta}</span></div>`;
    } 
    // Calculated minutes for future departures
    else if (route.calculatedMinutes) {
      routeHTML += `<div class="eta">יוצא בעוד <span class="eta-time">${route.calculatedMinutes} דק'</span></div>`;
    }
    // Regular departure time
    else if (route.departureTime) {
      routeHTML += `<div class="departure-time">יוצא ב<span class="departure-exact">${route.departureTime}</span></div>`;
    }
    
    // Always add arrival time if available
    if (route.arrivalTime) {
      routeHTML += `<div class="arrival">${route.arrivalTime}</div>`;
    }
    
    routeHTML += '</div>';
    
    // Only show warning if we still don't have departure info
    if (!hasETAorDeparture) {
      routeHTML += `<div class="warning-info">לא נמצא מידע על זמני יציאה</div>`;
    }
    
    // Add walking distance if available
    if (route.walkingDistance) {
      routeHTML += `<div class="walking">${route.walkingDistance}</div>`;
    }
    
    // Add fare if available
    if (route.fare) {
      routeHTML += `<div class="fare">${route.fare}</div>`;
    }
    
    // Add details
    if (route.details && route.details.length) {
      routeHTML += '<div class="details">';
      route.details.forEach(detail => {
        // Only add details that haven't been shown elsewhere
        if (!detail.includes('יציאה:') && 
            !detail.includes('הגעה:') && 
            !detail.includes('מתחנת') && 
            !routeHTML.includes(detail)) {
          routeHTML += `<div class="detail-item">${detail}</div>`;
        }
      });
      routeHTML += '</div>';
    }
    
    routeElement.innerHTML = routeHTML;
    routesContainer.appendChild(routeElement);
  });
}

// Load data from the background script
function loadData(forceRefresh = false) {
  if (!forceRefresh) {
    showLoading();
  }
  
  const action = forceRefresh ? "forceRefresh" : "getData";
  console.log(`Requesting data from background script (${action})`);
  
  try {
    chrome.runtime.sendMessage({ action: action }, (response) => {
      console.log("Received response:", response);
      
      if (chrome.runtime.lastError) {
        console.error("Error in chrome.runtime.sendMessage:", chrome.runtime.lastError);
        showError("שגיאת תקשורת: " + chrome.runtime.lastError.message);
        return;
      }
      
      if (!response) {
        console.error("Empty response received");
        showError("התקבלה תשובה ריקה מהתוסף");
        return;
      }
      
      if (response.status === "success" && response.data) {
        // Make sure lastUpdated is set
        if (response.data && !response.data.lastUpdated && response.lastUpdate) {
          response.data.lastUpdated = response.lastUpdate;
        }
        
        displayRoutes(response.data);
      } else if (response.status === "loading") {
        showLoading();
        // Try again in a moment
        setTimeout(() => loadData(), 3000);
      } else {
        showError(response.message || "לא ניתן לטעון נתונים. נסה שוב מאוחר יותר.");
      }
    });
  } catch (e) {
    console.error("Exception in loadData:", e);
    showError("שגיאה בטעינת הנתונים: " + e.message);
  }
}

// Force refresh data
function refreshData() {
  showLoading();
  loadData(true);
}

// Auto-refresh timers
let fetchDataInterval = null;  // Gets new data from server
let updateTimesInterval = null;  // Updates waiting times locally

// Function to start auto-refresh
function startAutoRefresh() {
  // Stop any existing timers
  stopAutoRefresh();
  
  // Fetch new data every 60 seconds
  fetchDataInterval = setInterval(() => {
    loadData(true);
  }, 60000);  // 1 minute
  // Update waiting times every 10 seconds
  updateTimesInterval = setInterval(() => {
    updateWaitingTimes();
  }, 10000);  // 10 seconds
}

// Function to stop auto-refresh
function stopAutoRefresh() {
  if (fetchDataInterval) {
    clearInterval(fetchDataInterval);
    fetchDataInterval = null;
  }
  
  if (updateTimesInterval) {
    clearInterval(updateTimesInterval);
    updateTimesInterval = null;
  }
}

// Initialize popup
document.addEventListener('DOMContentLoaded', () => {
  console.log("Popup initialized");
  
  // Show loading initially
  showLoading();
  
  // Load data
  loadData();
  
  // Start auto-refresh
  startAutoRefresh();
  
  // Set up refresh button
  refreshButton.addEventListener('click', () => {
    refreshData();
  });
  
  // Stop auto-refresh when popup is closed
  window.addEventListener('unload', stopAutoRefresh);
});
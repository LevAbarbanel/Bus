// Constants
const MOOVIT_URL = "https://moovitapp.com/israel-1/poi/%D7%94%D7%92%D7%A0%D7%99%D7%9D%2017/%D7%AA%D7%99%D7%9B%D7%95%D7%9F%20%D7%A8%D7%95%D7%98%D7%91%D7%A8%D7%92/he?customerId=4908&fll=32.134469_34.841899&tll=32.125292_34.819943";
const DATA_STORAGE_KEY = "moovitRouteData";
const UPDATE_TIMESTAMP_KEY = "lastUpdateTimestamp";

// Flag to prevent multiple simultaneous fetches
let fetchInProgress = false;

// Initialize data fetching when extension is installed or updated
chrome.runtime.onInstalled.addListener(() => {
  console.log("Extension installed. Starting initial data fetch...");
  startBackgroundProcesses();
});

// Start all background processes
function startBackgroundProcesses() {
  // Fetch data immediately
  fetchAndStoreData();
  
  // Set up alarm for periodic fetching (every minute)
  chrome.alarms.create('fetchDataAlarm', {
    periodInMinutes: 1
  });
  
  // Listen for alarm events
  chrome.alarms.onAlarm.addListener((alarm) => {
    if (alarm.name === 'fetchDataAlarm') {
      fetchAndStoreData();
    }
  });
}

// Listen for messages from the popup
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log("Message received:", message.action);
  
  if (message.action === "getData") {
    // Get data from storage and send it back to popup
    chrome.storage.local.get([DATA_STORAGE_KEY, UPDATE_TIMESTAMP_KEY], (result) => {
      console.log("Storage data retrieved:", result);
      const data = result[DATA_STORAGE_KEY];
      const lastUpdate = result[UPDATE_TIMESTAMP_KEY];
      
      if (data) {
        console.log("Returning cached data with", data.routes ? data.routes.length : 0, "routes");
        sendResponse({
          data: data,
          lastUpdate: lastUpdate,
          status: "success"
        });
      } else {
        console.log("No data found, starting fetch");
        // No data yet, fetch it immediately
        sendResponse({
          status: "loading",
          message: "Data is still loading for the first time"
        });
        
        // Start data fetch if not already running
        fetchAndStoreData();
      }
    });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  if (message.action === "forceRefresh") {
    console.log("Force refresh requested");
    // Immediately fetch new data
    fetchAndStoreData()
      .then(data => {
        if (data) {
          console.log("Force refresh successful, routes:", data.routes ? data.routes.length : 0);
          sendResponse({
            data: data,
            status: "success",
            message: "Data refreshed successfully"
          });
        } else {
          console.log("Force refresh failed");
          sendResponse({
            status: "error",
            message: "Failed to refresh data"
          });
        }
      })
      .catch(error => {
        console.error("Force refresh error:", error);
        sendResponse({
          status: "error",
          message: "Error refreshing data: " + error.message
        });
      });
    
    // Return true to indicate we'll respond asynchronously
    return true;
  }
  
  // If we get here, we didn't handle the message
  return false;
});

// Main function to fetch and store data
async function fetchAndStoreData() {
  // Prevent multiple simultaneous fetches
  if (fetchInProgress) {
    console.log("Data fetch already in progress, skipping");
    return null;
  }
  
  fetchInProgress = true;
  console.log("Starting data fetch at", new Date().toLocaleTimeString());
  
  let tab = null;
  try {
    // Create a completely hidden tab - using tabs instead of windows to avoid state errors
    tab = await new Promise((resolve, reject) => {
      chrome.tabs.create({ 
        url: MOOVIT_URL,
        active: false  // This keeps it in the background
      }, (newTab) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(newTab);
        }
      });
    });
    
    console.log("Created hidden tab with ID:", tab.id);
    
    // Wait for the page to load enough that we can extract data
    await new Promise(resolve => setTimeout(resolve, 12000));
    
    // Check if the suggested routes element exists
    const checkResult = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const routesElement = document.querySelector('mv-suggested-routes');
        return !!routesElement;
      }
    }).catch(error => {
      console.error("Error checking for routes element:", error);
      return [{ result: false }];
    });
    
    const dataReady = checkResult && checkResult[0] && checkResult[0].result;
    
    // Element not found, wait a bit longer
    if (!dataReady) {
      console.log("Routes element not found, waiting longer...");
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
    
    // Extract the data
    const result = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        try {
          console.log("Starting data extraction on page");
          const data = {
            timestamp: new Date().toISOString(),
            routes: []
          };
          
          // Find the routes container
          const container = document.querySelector('mv-suggested-routes');
          if (!container) {
            console.error("Routes container not found in page");
            return { 
              error: "Routes container not found",
              timestamp: new Date().toISOString(),
              routes: []
            };
          }
          
          // Process each route section
          const routeSections = container.querySelectorAll('mv-suggested-routes-section');
          console.log("Found", routeSections.length, "route sections");
          
          routeSections.forEach((section, sectionIndex) => {
            // Get section title
            const sectionTitle = section.querySelector('.title')?.textContent.trim() || '';
            console.log(`Processing section ${sectionIndex + 1}: "${sectionTitle}"`);
            
            // Skip sections that aren't for public transport (like walking/cycling)
            if (sectionTitle.includes("מסלולי הליכה ואופניים")) {
              console.log("Skipping walking/cycling section");
              return;
            }
            
            // Process each route in this section
            const routeElements = section.querySelectorAll('mv-suggested-route');
            console.log(`Found ${routeElements.length} routes in this section`);
            
            routeElements.forEach((routeEl, routeIndex) => {
              console.log(`Processing route ${routeIndex + 1} in section ${sectionIndex + 1}`);
              
              const route = {
                section: sectionTitle,
                lines: [],
                details: []
              };
              
              // Extract duration
              const durationEl = routeEl.querySelector('.duration');
              if (durationEl) {
                route.duration = durationEl.textContent.trim();
                console.log(`Found duration: ${route.duration}`);
              }
              
              // Extract arrival time
              const arrivalEl = routeEl.querySelector('.end-time');
              if (arrivalEl) {
                route.arrivalTime = arrivalEl.textContent.trim().replace('הגעה ב-', '');
                console.log(`Found arrival time: ${route.arrivalTime}`);
              }
              
              // Extract fare if available
              const fareEl = routeEl.querySelector('.fare');
              if (fareEl) {
                route.fare = fareEl.textContent.trim();
                console.log(`Found fare: ${route.fare}`);
              }
              
              // Extract line numbers - BASED ON ACTUAL HTML STRUCTURE
              try {
                // First, find all the legs
                const legsContainer = routeEl.querySelector('.legs-types');
                if (legsContainer) {
                  const legElements = legsContainer.querySelectorAll('.single-leg');
                  
                  legElements.forEach(leg => {
                    // Check if this is a transit leg (not walking)
                    const hasTransit = leg.querySelector('.transit');
                    
                    if (hasTransit) {
                      // This is a transit leg, extract the line numbers
                      const lineTexts = leg.querySelectorAll('.text');
                      
                      if (lineTexts && lineTexts.length > 0) {
                        // Found line numbers in text elements
                        lineTexts.forEach(lineText => {
                          const lineNumber = lineText.textContent.trim();
                          if (lineNumber && !route.lines.includes(lineNumber)) {
                            route.lines.push(lineNumber);
                          }
                        });
                      } else {
                        // Try to extract from tooltip
                        const tooltip = leg.getAttribute('tooltip');
                        if (tooltip) {
                          // Format might be like "21 - תל אביב-יפו / 24 - תל אביב-יפו"
                          // Extract just the numbers
                          const lineMatches = tooltip.match(/\d+/g);
                          if (lineMatches) {
                            lineMatches.forEach(lineNumber => {
                              if (!route.lines.includes(lineNumber)) {
                                route.lines.push(lineNumber);
                              }
                            });
                          }
                        }
                      }
                    }
                    
                    // Extract walking information if present
                    if (leg.querySelector('img[alt="הליכה"]')) {
                      const walkTimeEl = leg.querySelector('.walk-time');
                      if (walkTimeEl) {
                        route.walkingDistance = walkTimeEl.textContent.trim() + ' דק\'';
                      }
                    }
                  });
                }
                
                console.log(`Found lines: ${route.lines.join(', ')}`);
              } catch (err) {
                console.error("Error extracting line numbers:", err);
              }
              
              // Extract departure details and real-time ETA
              try {
                const legsDescription = routeEl.querySelector('.legs-description');
                if (legsDescription) {
                  const descText = legsDescription.textContent.trim();
                  route.details.push(descText);
                  
                  // Check for real-time class
                  const isRealTime = legsDescription.classList.contains('real-time');
                  if (isRealTime) {
                    route.isRealTime = true;
                  }
                  
                  // Extract departure time from fixed schedule
                  if (descText.includes('יוצא ב-')) {
                    const departureMatch = descText.match(/יוצא ב-([^\s]+)/);
                    if (departureMatch && departureMatch[1]) {
                      route.departureTime = departureMatch[1];
                      console.log(`Found fixed departure time: ${route.departureTime}`);
                    }
                  }
                  
                  // Extract real-time ETA (like "יוצא בעוד 3 דק׳")
                  const etaMatch = descText.match(/יוצא בעוד\s+(?:<[^>]+>)*\s*(\d+)\s*(?:<[^>]+>)*\s*דק׳/);
                  if (etaMatch && etaMatch[1]) {
                    route.eta = etaMatch[1] + ' דק׳';
                    route.etaMinutes = parseInt(etaMatch[1], 10);
                    console.log(`Found real-time ETA: ${route.eta}`);
                  }
                  
                  // Extract station/stop name - everything after the departure details
                  if (descText.includes('מתחנת')) {
                    const stationMatch = descText.match(/מתחנת ([^$]+)$/);
                    if (stationMatch && stationMatch[1]) {
                      route.station = stationMatch[1].trim();
                      console.log(`Found station: ${route.station}`);
                    }
                  }
                  
                  console.log(`Found departure info: ${descText}`);
                }
                
                // Direct extraction of ETA element if available (another approach)
                const etaElement = routeEl.querySelector('.eta');
                if (etaElement) {
                  const etaText = etaElement.textContent.trim();
                  if (etaText && etaText.includes('דק׳')) {
                    const etaMinutes = etaText.replace(/[^\d]/g, '');
                    if (etaMinutes) {
                      route.eta = etaMinutes + ' דק׳';
                      route.etaMinutes = parseInt(etaMinutes, 10);
                      console.log(`Found direct ETA element: ${route.eta}`);
                    }
                  }
                }
              } catch (err) {
                console.error("Error extracting departure/ETA info:", err);
              }
              
              // Add the route data if we have line numbers
              if (route.lines.length > 0 || route.walkingDistance) {
                data.routes.push(route);
              }
            });
          });
          
          console.log(`Extraction complete. Found ${data.routes.length} valid routes.`);
          return data;
        } catch (err) {
          console.error("Error extracting data:", err);
          return { 
            error: err.message,
            timestamp: new Date().toISOString(),
            routes: []
          };
        }
      }
    }).catch(error => {
      console.error("Error executing script:", error);
      return null;
    });
    
    // Process the result
    const data = result && result[0] && result[0].result;
    if (data && data.routes && data.routes.length > 0) {
      console.log("Data fetched successfully, routes found:", data.routes.length);
      
      // Add current update time
      data.lastUpdated = new Date().toISOString();
      
      // Store the data
      await new Promise(resolve => {
        chrome.storage.local.set({
          [DATA_STORAGE_KEY]: data,
          [UPDATE_TIMESTAMP_KEY]: data.lastUpdated
        }, () => {
          if (chrome.runtime.lastError) {
            console.error("Error saving to storage:", chrome.runtime.lastError);
          } else {
            console.log("Data saved to storage successfully");
          }
          resolve();
        });
      });
      
      fetchInProgress = false;
      return data;
    } else {
      console.error("Error fetching data or no routes found:", data?.error || "No routes");
      fetchInProgress = false;
      return null;
    }
  } catch (error) {
    console.error("Error in fetchAndStoreData:", error);
    fetchInProgress = false;
    return null;
  } finally {
    // ALWAYS make sure the tab is closed
    if (tab) {
      try {
        await new Promise(resolve => {
          chrome.tabs.remove(tab.id, () => {
            console.log("Tab closed");
            resolve();
          });
        });
      } catch (closeError) {
        console.error("Error closing tab:", closeError);
      }
    }
  }
}
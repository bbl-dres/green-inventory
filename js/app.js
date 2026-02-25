// BBL GIS Immobilienportfolio - Main Application Script
// Extracted from index.html for better maintainability

// Mapbox Access Token
        mapboxgl.accessToken = 'pk.eyJ1IjoiZGF2aWRyYXNuZXI1IiwiYSI6ImNtMm5yamVkdjA5MDcycXMyZ2I2MHRhamgifQ.m651j7WIX7MyxNh8KIQ1Gg';
        
        // Variables
        var portfolioData = null;
        var parcelData = null;
        var furnitureData = null;
        var treeData = null;
        var greenAreaData = null;
        var surfaceData = null;
        var gardenData = null;
        var filteredData = null;
        var selectedBuildingId = null;
        var selectedParcelId = null;
        var searchMarker = null;

        // Extended data stores
        var careProfileData = null;
        var contactData = null;
        var contractData = null;
        var costData = null;
        var documentData = null;
        var speciesData = null;
        var inspectionData = null;
        var taskData = null;
        var plantingData = null;
        var sitesData = null;

        // Active Swisstopo layers added from search
        var activeSwisstopoLayers = [];
        // Track pending layer fetch requests for cancellation
        var pendingLayerFetches = {};

        // ===== UTILITY FUNCTIONS =====

        function escapeHtml(text) {
            if (text == null) return '';
            var div = document.createElement('div');
            div.textContent = text;
            return div.innerHTML;
        }

        // Escape for use in JS strings within HTML attributes (e.g., onclick handlers)
        function escapeForJs(text) {
            if (text == null) return '';
            return String(text)
                .replace(/\\/g, '\\\\')
                .replace(/'/g, "\\'")
                .replace(/"/g, '\\"');
        }

        // ===== TOAST NOTIFICATION SYSTEM =====

        var toastIcons = {
            error: 'error',
            warning: 'warning',
            success: 'check_circle',
            info: 'info'
        };

        function showToast(options) {
            var container = document.getElementById('toast-container');
            if (!container) return;

            var type = options.type || 'info';
            var title = options.title || '';
            var message = options.message || '';
            var duration = options.duration !== undefined ? options.duration : 5000;
            var actions = options.actions || [];

            var toast = document.createElement('div');
            toast.className = 'toast toast-' + type;

            var html = '<div class="toast-icon"><span class="material-symbols-outlined">' + toastIcons[type] + '</span></div>';
            html += '<div class="toast-content">';
            if (title) {
                html += '<div class="toast-title">' + escapeHtml(title) + '</div>';
            }
            if (message) {
                html += '<div class="toast-message">' + escapeHtml(message) + '</div>';
            }
            if (actions.length > 0) {
                html += '<div class="toast-actions">';
                actions.forEach(function(action, index) {
                    html += '<button class="toast-action-btn ' + (action.primary ? 'primary' : 'secondary') + '" data-action="' + index + '">' + escapeHtml(action.label) + '</button>';
                });
                html += '</div>';
            }
            html += '</div>';
            html += '<button class="toast-close" aria-label="Schliessen"><span class="material-symbols-outlined">close</span></button>';

            toast.innerHTML = html;
            container.appendChild(toast);

            // Handle close button
            var closeBtn = toast.querySelector('.toast-close');
            closeBtn.addEventListener('click', function() {
                hideToast(toast);
            });

            // Handle action buttons
            actions.forEach(function(action, index) {
                var btn = toast.querySelector('[data-action="' + index + '"]');
                if (btn && action.onClick) {
                    btn.addEventListener('click', function() {
                        action.onClick();
                        hideToast(toast);
                    });
                }
            });

            // Auto-hide after duration (if not 0)
            if (duration > 0) {
                setTimeout(function() {
                    hideToast(toast);
                }, duration);
            }

            return toast;
        }

        function hideToast(toast) {
            if (!toast || !toast.parentNode) return;
            toast.classList.add('hiding');
            setTimeout(function() {
                if (toast.parentNode) {
                    toast.parentNode.removeChild(toast);
                }
            }, 300);
        }

        function showError(title, message, retryCallback) {
            var actions = [];
            if (retryCallback) {
                actions.push({
                    label: 'Erneut versuchen',
                    primary: true,
                    onClick: retryCallback
                });
            }
            return showToast({
                type: 'error',
                title: title,
                message: message,
                duration: retryCallback ? 0 : 8000,
                actions: actions
            });
        }

        function showWarning(title, message) {
            return showToast({
                type: 'warning',
                title: title,
                message: message,
                duration: 6000
            });
        }

        function showSuccess(title, message) {
            return showToast({
                type: 'success',
                title: title,
                message: message,
                duration: 4000
            });
        }

        function showInfo(title, message) {
            return showToast({
                type: 'info',
                title: title,
                message: message,
                duration: 5000
            });
        }

        // ===== LOADING OVERLAY =====

        function showLoadingOverlay(text) {
            var overlay = document.getElementById('loading-overlay');
            if (overlay) {
                var textEl = overlay.querySelector('.loading-text');
                if (textEl && text) {
                    textEl.textContent = text;
                }
                overlay.classList.remove('hidden');
            }
        }

        function hideLoadingOverlay() {
            var overlay = document.getElementById('loading-overlay');
            if (overlay) {
                overlay.classList.add('hidden');
            }
        }

        // ===== FETCH WITH ERROR HANDLING =====

        function fetchWithErrorHandling(url, options) {
            return fetch(url, options)
                .then(function(response) {
                    if (!response.ok) {
                        throw new Error('HTTP ' + response.status + ': ' + response.statusText);
                    }
                    return response.json();
                });
        }

        // Graceful fetch that returns null on failure (for optional data files)
        function fetchOptional(url) {
            return fetch(url)
                .then(function(response) {
                    if (!response.ok) return null;
                    return response.json();
                })
                .catch(function() { return null; });
        }

        // ===== FILTER STATE =====
        var activeFilters = {
            status: [],
            eigentum: [],
            teilportfolio: [],
            gebaeudeart: [],
            land: [],
            region: []
        };

        // Filter configuration - maps filter keys to data properties
        var filterConfig = {
            status: { property: 'status', label: 'Status' },
            eigentum: { property: 'typeOfOwnership', label: 'Art Eigentum' },
            teilportfolio: { property: 'extensionData.portfolio', label: 'Teilportfolio' },
            gebaeudeart: { property: 'primaryTypeOfBuilding', label: 'Gebäudeart' },
            land: { property: 'country', label: 'Land' },
            region: { property: 'stateProvincePrefecture', label: 'Region' }
        };

        // ===== FILTER FUNCTIONS =====

        function getFiltersFromURL() {
            var params = new URLSearchParams(window.location.search);
            var filters = {
                status: [],
                eigentum: [],
                teilportfolio: [],
                gebaeudeart: [],
                land: [],
                region: []
            };

            Object.keys(filters).forEach(function(key) {
                var value = params.get('filter_' + key);
                if (value) {
                    filters[key] = value.split(',').map(function(v) {
                        return decodeURIComponent(v);
                    });
                }
            });

            return filters;
        }

        function setFiltersInURL(filters) {
            var url = new URL(window.location);

            // Remove all filter params first
            Object.keys(filters).forEach(function(key) {
                url.searchParams.delete('filter_' + key);
            });

            // Add active filters
            Object.keys(filters).forEach(function(key) {
                if (filters[key].length > 0) {
                    var encoded = filters[key].map(function(v) {
                        return encodeURIComponent(v);
                    }).join(',');
                    url.searchParams.set('filter_' + key, encoded);
                }
            });

            window.history.pushState({}, '', url);
        }

        function getActiveFilterCount() {
            var count = 0;
            Object.keys(activeFilters).forEach(function(key) {
                count += activeFilters[key].length;
            });
            return count;
        }

        // Helper: Get property value — supports dot-notation flat keys (e.g., "extensionData.portfolio")
        function getNestedProperty(obj, path) {
            // Try direct key lookup first (flat dot-notation keys like "extensionData.portfolio")
            if (obj != null && path in obj) return obj[path];
            // Fall back to nested traversal
            var parts = path.split('.');
            var current = obj;
            for (var i = 0; i < parts.length; i++) {
                if (current == null) return undefined;
                current = current[parts[i]];
            }
            return current;
        }

        function applyFilters() {
            if (!portfolioData) return;

            // Filter the data
            filteredData = {
                type: portfolioData.type,
                name: portfolioData.name,
                features: portfolioData.features.filter(function(feature) {
                    var props = feature.properties;

                    // Check each filter category (AND between categories)
                    for (var filterKey in activeFilters) {
                        var filterValues = activeFilters[filterKey];
                        if (filterValues.length === 0) continue;

                        var propKey = filterConfig[filterKey].property;
                        var propValue = getNestedProperty(props, propKey);

                        // OR within category - at least one must match
                        var matches = filterValues.some(function(filterValue) {
                            return propValue === filterValue;
                        });

                        if (!matches) return false;
                    }

                    return true;
                })
            };

            // Update URL
            setFiltersInURL(activeFilters);

            // Update object count
            updateObjectCount();

            // Update export count
            updateExportCount();

            // Update filter button state
            updateFilterButtonState();

            // Re-render current view
            renderCurrentView();

            // Update map layer filter if on map view
            if (currentView === 'map' && window.map && map.getLayer('buildings-fill')) {
                updateMapFilter();
            }
        }

        function updateMapFilter() {
            if (!map || !map.getLayer('buildings-fill')) return;

            // If no active filters, show all buildings
            if (getActiveFilterCount() === 0) {
                map.setFilter('buildings-fill', null);
                if (map.getLayer('buildings-outline')) {
                    map.setFilter('buildings-outline', null);
                }
                if (map.getLayer('buildings-labels')) {
                    map.setFilter('buildings-labels', null);
                }
                return;
            }

            var filteredIds = filteredData.features.map(function(f) {
                return f.properties.buildingId;
            });

            // Apply filter to show only filtered buildings
            map.setFilter('buildings-fill', ['in', ['get', 'buildingId'], ['literal', filteredIds]]);

            // Also filter outline layer
            if (map.getLayer('buildings-outline')) {
                map.setFilter('buildings-outline', ['in', ['get', 'buildingId'], ['literal', filteredIds]]);
            }

            // Also filter labels layer if it exists
            if (map.getLayer('buildings-labels')) {
                map.setFilter('buildings-labels', ['in', ['get', 'buildingId'], ['literal', filteredIds]]);
            }

            // Zoom to fit filtered points
            zoomToFilteredPoints();
        }

        function zoomToFilteredPoints() {
            if (!filteredData || filteredData.features.length === 0) return;

            var features = filteredData.features;

            if (features.length === 1) {
                // Single building - fly to its centroid
                var centroid = getPolygonCentroid(features[0].geometry.coordinates);
                map.flyTo({
                    center: centroid,
                    zoom: 14,
                    duration: 1000
                });
            } else {
                // Multiple buildings - fit bounds using centroids
                var bounds = new mapboxgl.LngLatBounds();
                features.forEach(function(feature) {
                    bounds.extend(getPolygonCentroid(feature.geometry.coordinates));
                });
                map.fitBounds(bounds, {
                    padding: 80,
                    duration: 1000,
                    maxZoom: 16
                });
            }
        }

        function resetFilters() {
            activeFilters = {
                status: [],
                eigentum: [],
                teilportfolio: [],
                gebaeudeart: [],
                land: [],
                region: []
            };

            // Uncheck all filter checkboxes
            document.querySelectorAll('#drawer-filter-content input[type="checkbox"]').forEach(function(cb) {
                cb.checked = false;
            });

            applyFilters();
        }

        function updateObjectCount() {
            var count = filteredData ? filteredData.features.length : (portfolioData ? portfolioData.features.length : 0);
            var countEl = document.getElementById('object-count');
            if (countEl) {
                countEl.textContent = count + ' Standorte';
            }
        }

        function updateFilterButtonState() {
            var drawerBtn = document.getElementById('smart-drawer-btn');
            if (!drawerBtn) return;

            var count = getActiveFilterCount();

            if (count > 0) {
                // Add active filters highlight
                drawerBtn.classList.add('has-active-filters');
                // Add or update count badge
                var badge = drawerBtn.querySelector('.filter-count');
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'filter-count';
                    drawerBtn.appendChild(badge);
                }
                badge.textContent = count;
            } else {
                // Remove active filters highlight
                drawerBtn.classList.remove('has-active-filters');
                // Remove count badge
                var badge = drawerBtn.querySelector('.filter-count');
                if (badge) {
                    badge.remove();
                }
            }
        }

        function renderCurrentView() {
            // Map view updates via updateMapFilter()
        }

        // ===== SMART DRAWER =====

        function toggleSmartDrawer(open) {
            var drawer = document.getElementById('smart-drawer');
            var drawerBtn = document.getElementById('smart-drawer-btn');

            if (open === undefined) {
                open = !drawer.classList.contains('open');
            }

            if (open) {
                drawer.classList.add('open');
                drawerBtn.classList.add('panel-open');
                drawerBtn.setAttribute('aria-expanded', 'true');
            } else {
                drawer.classList.remove('open');
                drawerBtn.classList.remove('panel-open');
                drawerBtn.setAttribute('aria-expanded', 'false');
            }

            // Resize map after transition completes
            if (window.map) {
                setTimeout(function() {
                    map.resize();
                }, 350);
            }
        }

        // ===== DRAWER RESIZE =====
        function initDrawerResize() {
            var drawer = document.getElementById('smart-drawer');
            var handle = drawer.querySelector('.smart-drawer-resize-handle');
            if (!handle) return;

            var isResizing = false;
            var startX, startWidth;

            // Get min/max from CSS variables
            var styles = getComputedStyle(document.documentElement);
            var minWidth = parseInt(styles.getPropertyValue('--drawer-min-width')) || 300;
            var maxWidth = parseInt(styles.getPropertyValue('--drawer-max-width')) || 800;

            // Load saved width from localStorage
            var savedWidth = localStorage.getItem('drawerWidth');
            if (savedWidth) {
                document.documentElement.style.setProperty('--drawer-width', savedWidth + 'px');
            }

            handle.addEventListener('mousedown', function(e) {
                isResizing = true;
                startX = e.clientX;
                startWidth = drawer.offsetWidth;
                handle.classList.add('dragging');
                drawer.classList.add('resizing');
                document.body.style.cursor = 'ew-resize';
                document.body.style.userSelect = 'none';
                e.preventDefault();
            });

            document.addEventListener('mousemove', function(e) {
                if (!isResizing) return;

                // Calculate new width (dragging left = wider, right = narrower)
                var delta = startX - e.clientX;
                var newWidth = Math.min(maxWidth, Math.max(minWidth, startWidth + delta));

                document.documentElement.style.setProperty('--drawer-width', newWidth + 'px');
            });

            document.addEventListener('mouseup', function() {
                if (!isResizing) return;

                isResizing = false;
                handle.classList.remove('dragging');
                drawer.classList.remove('resizing');
                document.body.style.cursor = '';
                document.body.style.userSelect = '';

                // Save width to localStorage
                var currentWidth = drawer.offsetWidth;
                localStorage.setItem('drawerWidth', currentWidth);

                // Resize map
                if (window.map) {
                    map.resize();
                }
            });
        }

        function initFilterOptions() {
            if (!portfolioData) return;

            // Collect unique values for each filter category
            var uniqueValues = {
                status: new Set(),
                eigentum: new Set(),
                teilportfolio: new Set(),
                gebaeudeart: new Set(),
                land: new Set(),
                region: new Set()
            };

            portfolioData.features.forEach(function(feature) {
                var props = feature.properties;
                if (props.status) uniqueValues.status.add(props.status);
                if (props.typeOfOwnership) uniqueValues.eigentum.add(props.typeOfOwnership);
                if (props['extensionData.portfolio']) uniqueValues.teilportfolio.add(props['extensionData.portfolio']);
                if (props.primaryTypeOfBuilding) uniqueValues.gebaeudeart.add(props.primaryTypeOfBuilding);
                if (props.country) uniqueValues.land.add(props.country);
                if (props.stateProvincePrefecture) uniqueValues.region.add(props.stateProvincePrefecture);
            });

            // Render options for each filter
            Object.keys(uniqueValues).forEach(function(filterKey) {
                var container = document.getElementById('filter-' + filterKey + '-options');
                if (!container) return;

                var values = Array.from(uniqueValues[filterKey]).sort();
                var html = '';

                values.forEach(function(value) {
                    var id = 'filter-' + filterKey + '-' + value.replace(/[^a-zA-Z0-9]/g, '_');
                    var checked = activeFilters[filterKey].includes(value) ? 'checked' : '';

                    html += '<div class="filter-option">' +
                        '<input type="checkbox" id="' + id + '" data-filter="' + filterKey + '" data-value="' + value + '" ' + checked + '>' +
                        '<label for="' + id + '">' + value + '</label>' +
                        '</div>';
                });

                container.innerHTML = html;

                // Add event listeners to checkboxes
                container.querySelectorAll('input[type="checkbox"]').forEach(function(checkbox) {
                    checkbox.addEventListener('change', function() {
                        var filterKey = this.dataset.filter;
                        var value = this.dataset.value;

                        if (this.checked) {
                            if (!activeFilters[filterKey].includes(value)) {
                                activeFilters[filterKey].push(value);
                            }
                        } else {
                            activeFilters[filterKey] = activeFilters[filterKey].filter(function(v) {
                                return v !== value;
                            });
                        }

                        applyFilters();
                    });
                });
            });
        }

        function initFilterPane() {
            // Toggle smart drawer via header button
            document.getElementById('smart-drawer-btn').addEventListener('click', function() {
                toggleSmartDrawer();
            });

            // Project settings button
            document.getElementById('project-settings-btn').addEventListener('click', function() {
                switchView('settings');
            });

            // Close smart drawer
            document.getElementById('drawer-close-btn').addEventListener('click', function() {
                toggleSmartDrawer(false);
            });

            // Reset filters (button inside drawer)
            document.getElementById('drawer-reset-btn').addEventListener('click', function() {
                resetFilters();
            });


            // Filter section accordion toggle
            document.querySelectorAll('.filter-section-header').forEach(function(header) {
                header.addEventListener('click', function() {
                    var section = this.parentElement;
                    section.classList.toggle('open');
                });
            });

            // Close on Escape key
            document.addEventListener('keydown', function(e) {
                if (e.key === 'Escape') {
                    toggleSmartDrawer(false);
                }
            });

            // Logo click - navigate to map view
            document.getElementById('logo-area').addEventListener('click', function() {
                resetFilters();
                switchView('map');
            });
        }

        // ===== EXPORT PANEL FUNCTIONS =====
        var selectedExportFormat = 'geojson';

        function initExportPanel() {
            // Format card selection
            document.querySelectorAll('.export-format-card').forEach(function(card) {
                card.addEventListener('click', function() {
                    document.querySelectorAll('.export-format-card').forEach(function(c) {
                        c.classList.remove('active');
                    });
                    this.classList.add('active');
                    selectedExportFormat = this.getAttribute('data-format');
                });
            });

            // Data selection change
            var dataSelection = document.getElementById('export-data-selection');
            if (dataSelection) {
                dataSelection.addEventListener('change', updateExportCount);
            }

            // Export button
            var exportBtn = document.getElementById('export-btn');
            if (exportBtn) {
                exportBtn.addEventListener('click', performExport);
            }

            // Initial count update
            updateExportCount();
        }

        function updateExportCount() {
            var countEl = document.getElementById('export-count');
            var dataSelection = document.getElementById('export-data-selection');
            if (!countEl || !dataSelection) return;

            var count = 0;
            var selection = dataSelection.value;

            if (selection === 'filtered') {
                count = filteredData ? filteredData.length : 0;
            } else if (selection === 'all') {
                count = portfolioData ? portfolioData.length : 0;
            } else if (selection === 'selected') {
                count = selectedBuildingId ? 1 : 0;
            }

            countEl.textContent = count + ' Objekt' + (count !== 1 ? 'e' : '') + ' werden exportiert';
        }

        function getExportData() {
            var dataSelection = document.getElementById('export-data-selection');
            var selection = dataSelection ? dataSelection.value : 'filtered';

            if (selection === 'filtered') {
                return filteredData || [];
            } else if (selection === 'all') {
                return portfolioData || [];
            } else if (selection === 'selected' && selectedBuildingId) {
                var building = portfolioData.find(function(b) {
                    return b.properties.buildingId === selectedBuildingId;
                });
                return building ? [building] : [];
            }
            return [];
        }

        function performExport() {
            var data = getExportData();
            if (data.length === 0) {
                showToast({ type: 'error', message: 'Keine Daten zum Exportieren vorhanden' });
                return;
            }

            var btn = document.getElementById('export-btn');
            var originalHTML = btn.innerHTML;
            btn.innerHTML = '<span class="material-symbols-outlined">hourglass_empty</span><span>Exportiere...</span>';
            btn.disabled = true;

            setTimeout(function() {
                try {
                    switch (selectedExportFormat) {
                        case 'geojson':
                            exportGeoJSON(data);
                            break;
                        case 'csv':
                            exportCSV(data);
                            break;
                        case 'kml':
                            exportKML(data);
                            break;
                        case 'shapefile':
                            exportShapefile(data);
                            break;
                    }
                    showToast({ type: 'success', message: 'Export erfolgreich abgeschlossen' });
                } catch (e) {
                    console.error('Export error:', e);
                    showToast({ type: 'error', message: 'Fehler beim Export: ' + e.message });
                }

                btn.innerHTML = originalHTML;
                btn.disabled = false;
            }, 300);
        }

        function exportGeoJSON(data) {
            var includeCoords = document.getElementById('export-coords').checked;
            var includeParcels = document.getElementById('export-parcels').checked;

            var featureCollection = {
                type: 'FeatureCollection',
                features: data.map(function(feature) {
                    var exportFeature = JSON.parse(JSON.stringify(feature));
                    if (!includeCoords) {
                        delete exportFeature.geometry;
                    }
                    return exportFeature;
                })
            };

            // Add parcels if requested
            if (includeParcels && parcelData && parcelData.features) {
                featureCollection.features = featureCollection.features.concat(
                    parcelData.features.map(function(f) {
                        return JSON.parse(JSON.stringify(f));
                    })
                );
            }

            var blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
            downloadBlob(blob, 'bbl-portfolio-export.geojson');
        }

        function exportCSV(data) {
            var allFields = document.getElementById('export-all-fields').checked;
            var visibleOnly = document.getElementById('export-visible-only').checked;
            var includeCoords = document.getElementById('export-coords').checked;

            // Define columns
            var columns = ['buildingId', 'name', 'address', 'city', 'country', 'status', 'energyClass', 'flaeche'];

            if (allFields && !visibleOnly) {
                columns = ['buildingId', 'name', 'address', 'postalCode', 'city', 'country', 'region',
                          'status', 'ownershipType', 'portfolioGroup', 'buildingType', 'energyClass',
                          'flaeche', 'constructedYear', 'refurbishmentYear', 'parkingSpaces', 'evChargingStations'];
            }

            if (includeCoords) {
                columns.push('longitude', 'latitude');
            }

            // Build CSV content
            var csvContent = columns.join(';') + '\n';

            data.forEach(function(feature) {
                var props = feature.properties || {};
                var row = columns.map(function(col) {
                    if (col === 'longitude' && feature.geometry && feature.geometry.coordinates) {
                        if (feature.geometry.type === 'Polygon') {
                            var centroid = getPolygonCentroid(feature.geometry.coordinates);
                            return centroid[0];
                        }
                        return feature.geometry.coordinates[0];
                    }
                    if (col === 'latitude' && feature.geometry && feature.geometry.coordinates) {
                        if (feature.geometry.type === 'Polygon') {
                            var centroid = getPolygonCentroid(feature.geometry.coordinates);
                            return centroid[1];
                        }
                        return feature.geometry.coordinates[1];
                    }
                    var value = props[col];
                    if (value === null || value === undefined) return '';
                    // Escape quotes and wrap in quotes if contains separator
                    var strValue = String(value);
                    if (strValue.includes(';') || strValue.includes('"') || strValue.includes('\n')) {
                        strValue = '"' + strValue.replace(/"/g, '""') + '"';
                    }
                    return strValue;
                });
                csvContent += row.join(';') + '\n';
            });

            var blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' }); // BOM for Excel
            downloadBlob(blob, 'bbl-portfolio-export.csv');
        }

        function exportKML(data) {
            var includeCoords = document.getElementById('export-coords').checked;

            var kmlContent = '<?xml version="1.0" encoding="UTF-8"?>\n';
            kmlContent += '<kml xmlns="http://www.opengis.net/kml/2.2">\n';
            kmlContent += '  <Document>\n';
            kmlContent += '    <name>BBL Immobilienportfolio</name>\n';
            kmlContent += '    <description>Export vom ' + new Date().toLocaleDateString('de-CH') + '</description>\n';

            // Define styles for different statuses
            var statusStyles = {
                'In Betrieb': { color: 'ff50af4c', icon: 'grn-circle' },
                'In Renovation': { color: 'ff0098ff', icon: 'orange-circle' },
                'In Planung': { color: 'fff39621', icon: 'blu-circle' },
                'Ausser Betrieb': { color: 'ff9e9e9e', icon: 'grey-circle' }
            };

            Object.keys(statusStyles).forEach(function(status) {
                var style = statusStyles[status];
                kmlContent += '    <Style id="style-' + status.replace(/\s/g, '-') + '">\n';
                kmlContent += '      <IconStyle>\n';
                kmlContent += '        <color>' + style.color + '</color>\n';
                kmlContent += '        <scale>1.0</scale>\n';
                kmlContent += '        <Icon><href>http://maps.google.com/mapfiles/kml/paddle/' + style.icon + '.png</href></Icon>\n';
                kmlContent += '      </IconStyle>\n';
                kmlContent += '    </Style>\n';
            });

            data.forEach(function(feature) {
                var props = feature.properties || {};
                var coords = feature.geometry && feature.geometry.coordinates ? feature.geometry.coordinates : [0, 0];
                var status = props.status || 'In Betrieb';

                kmlContent += '    <Placemark>\n';
                kmlContent += '      <name>' + escapeXml(props.name || 'Unbekannt') + '</name>\n';
                kmlContent += '      <description><![CDATA[\n';
                kmlContent += '        <b>Adresse:</b> ' + escapeXml(props.address || '') + '<br>\n';
                kmlContent += '        <b>Stadt:</b> ' + escapeXml(props.city || '') + '<br>\n';
                kmlContent += '        <b>Status:</b> ' + escapeXml(status) + '<br>\n';
                kmlContent += '        <b>Energieklasse:</b> ' + escapeXml(props.energyClass || '-') + '<br>\n';
                kmlContent += '        <b>Fläche:</b> ' + (props.flaeche ? props.flaeche.toLocaleString('de-CH') + ' m²' : '-') + '\n';
                kmlContent += '      ]]></description>\n';
                kmlContent += '      <styleUrl>#style-' + status.replace(/\s/g, '-') + '</styleUrl>\n';

                if (includeCoords) {
                    kmlContent += '      <Point>\n';
                    kmlContent += '        <coordinates>' + coords[0] + ',' + coords[1] + ',0</coordinates>\n';
                    kmlContent += '      </Point>\n';
                }

                kmlContent += '    </Placemark>\n';
            });

            kmlContent += '  </Document>\n';
            kmlContent += '</kml>';

            var blob = new Blob([kmlContent], { type: 'application/vnd.google-earth.kml+xml' });
            downloadBlob(blob, 'bbl-portfolio-export.kml');
        }

        function exportShapefile(data) {
            // Shapefile export requires external library or server-side processing
            // For now, we'll export as GeoJSON with a note about conversion
            showToast({ type: 'info', title: 'Shapefile-Export', message: 'GeoJSON wird erstellt. Konvertieren Sie mit QGIS oder ogr2ogr zu Shapefile.' });

            var includeCoords = document.getElementById('export-coords').checked;

            var featureCollection = {
                type: 'FeatureCollection',
                name: 'bbl_portfolio',
                crs: { type: 'name', properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' } },
                features: data.map(function(feature) {
                    var exportFeature = JSON.parse(JSON.stringify(feature));
                    // Flatten properties for shapefile compatibility (10 char field names)
                    if (exportFeature.properties) {
                        var props = exportFeature.properties;
                        exportFeature.properties = {
                            bldg_id: props.buildingId,
                            name: (props.name || '').substring(0, 254),
                            address: (props.address || '').substring(0, 254),
                            city: (props.city || '').substring(0, 80),
                            country: (props.country || '').substring(0, 80),
                            status: (props.status || '').substring(0, 50),
                            energy_cls: props.energyClass,
                            area_m2: props.flaeche,
                            built_year: props.constructedYear,
                            portfolio: (props.portfolioGroup || '').substring(0, 80)
                        };
                    }
                    if (!includeCoords) {
                        delete exportFeature.geometry;
                    }
                    return exportFeature;
                })
            };

            var blob = new Blob([JSON.stringify(featureCollection, null, 2)], { type: 'application/geo+json' });
            downloadBlob(blob, 'bbl-portfolio-for-shapefile.geojson');
        }

        function escapeXml(str) {
            if (!str) return '';
            return String(str)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&apos;');
        }

        function downloadBlob(blob, filename) {
            var url = URL.createObjectURL(blob);
            var a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
        }

        // Legacy export handler for dropdown menu
        function handleExport(format) {
            selectedExportFormat = format;
            performExport();
        }

        // ===== SHARE FUNCTIONS =====
        function getShareUrl() {
            var baseUrl = window.location.origin + window.location.pathname;
            var params = new URLSearchParams(window.location.search);

            // Add current map position if map exists
            if (typeof map !== 'undefined' && map) {
                var center = map.getCenter();
                var zoom = map.getZoom();
                params.set('lng', center.lng.toFixed(5));
                params.set('lat', center.lat.toFixed(5));
                params.set('zoom', zoom.toFixed(2));
            }

            // Add selected building or parcel if one is selected
            if (selectedBuildingId) {
                params.set('id', selectedBuildingId);
                params.delete('parcelId');
            } else if (selectedParcelId) {
                params.set('parcelId', selectedParcelId);
                params.delete('id');
            } else {
                params.delete('id');
                params.delete('parcelId');
            }

            return baseUrl + '?' + params.toString();
        }

        function updateShareLink() {
            var input = document.getElementById('share-link-input');
            if (input) {
                input.value = getShareUrl();
            }
        }

        function shareViaEmail() {
            var url = getShareUrl();
            var subject = encodeURIComponent('BBL Immobilienportfolio - Kartenansicht');
            var body = encodeURIComponent('Schauen Sie sich diese Kartenansicht an:\n\n' + url);
            window.open('mailto:?subject=' + subject + '&body=' + body, '_self');
        }

        function shareViaFacebook() {
            var url = encodeURIComponent(getShareUrl());
            window.open('https://www.facebook.com/sharer/sharer.php?u=' + url, '_blank', 'width=600,height=400');
        }

        function shareViaLinkedIn() {
            var url = encodeURIComponent(getShareUrl());
            window.open('https://www.linkedin.com/sharing/share-offsite/?url=' + url, '_blank', 'width=600,height=400');
        }

        function shareViaX() {
            var url = encodeURIComponent(getShareUrl());
            var text = encodeURIComponent('BBL Immobilienportfolio - Kartenansicht');
            window.open('https://twitter.com/intent/tweet?url=' + url + '&text=' + text, '_blank', 'width=600,height=400');
        }

        function copyShareLink() {
            var input = document.getElementById('share-link-input');
            var button = document.querySelector('.share-copy-btn');

            if (input && navigator.clipboard) {
                navigator.clipboard.writeText(input.value).then(function() {
                    button.textContent = 'Kopiert!';
                    button.classList.add('copied');
                    setTimeout(function() {
                        button.textContent = 'Link kopieren';
                        button.classList.remove('copied');
                    }, 2000);
                });
            } else if (input) {
                // Fallback for older browsers
                input.select();
                document.execCommand('copy');
                button.textContent = 'Kopiert!';
                button.classList.add('copied');
                setTimeout(function() {
                    button.textContent = 'Link kopieren';
                    button.classList.remove('copied');
                }, 2000);
            }
        }

        // ===== PRINT FUNCTIONS =====
        function generatePrintPDF() {
            var orientation = document.getElementById('print-orientation').value;
            var scale = document.getElementById('print-scale').value;
            var includeLegend = document.getElementById('print-legend').checked;
            var includeGrid = document.getElementById('print-grid').checked;

            var btn = document.getElementById('print-pdf-btn');
            var originalText = btn.textContent;
            btn.textContent = 'Wird erstellt...';
            btn.disabled = true;

            // Get print dimensions based on orientation
            var printDimensions = getPrintDimensions(orientation);

            // Create print container
            var printContainer = document.createElement('div');
            printContainer.id = 'print-container';
            printContainer.style.cssText = 'position: fixed; top: 0; left: 0; width: ' + printDimensions.width + 'mm; height: ' + printDimensions.height + 'mm; background: white; z-index: 10000; padding: 10mm; box-sizing: border-box;';

            // Create header
            var header = document.createElement('div');
            header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 5mm; padding-bottom: 3mm; border-bottom: 1px solid #ccc;';
            header.innerHTML = '<div style="font-size: 14pt; font-weight: bold;">BBL Immobilienportfolio</div><div style="font-size: 10pt; color: #666;">' + new Date().toLocaleDateString('de-CH') + '</div>';
            printContainer.appendChild(header);

            // Create map container
            var mapContainer = document.createElement('div');
            var mapHeight = printDimensions.height - 40; // Account for header and footer
            if (includeLegend) mapHeight -= 25; // Reserve space for legend
            mapContainer.style.cssText = 'width: 100%; height: ' + mapHeight + 'mm; border: 1px solid #ccc; position: relative; overflow: hidden;';

            // Clone map canvas
            if (map) {
                var mapCanvas = map.getCanvas();
                var clonedCanvas = document.createElement('canvas');
                clonedCanvas.width = mapCanvas.width;
                clonedCanvas.height = mapCanvas.height;
                var ctx = clonedCanvas.getContext('2d');
                ctx.drawImage(mapCanvas, 0, 0);
                clonedCanvas.style.cssText = 'width: 100%; height: 100%; object-fit: contain;';
                mapContainer.appendChild(clonedCanvas);

                // Add coordinate grid overlay if requested
                if (includeGrid) {
                    var gridOverlay = document.createElement('div');
                    gridOverlay.style.cssText = 'position: absolute; top: 0; left: 0; width: 100%; height: 100%; pointer-events: none;';
                    gridOverlay.innerHTML = createCoordinateGrid();
                    mapContainer.appendChild(gridOverlay);
                }

                // Add scale bar
                var scaleBar = document.createElement('div');
                scaleBar.style.cssText = 'position: absolute; bottom: 5mm; left: 5mm; background: rgba(255,255,255,0.9); padding: 2mm 3mm; border-radius: 2px; font-size: 8pt;';
                var currentScale = scale === 'auto' ? Math.round(getMapScale()) : parseInt(scale);
                scaleBar.textContent = 'Massstab 1:' + currentScale.toLocaleString('de-CH');
                mapContainer.appendChild(scaleBar);

                // Add north arrow
                var northArrow = document.createElement('div');
                northArrow.style.cssText = 'position: absolute; top: 5mm; right: 5mm; background: rgba(255,255,255,0.9); padding: 2mm; border-radius: 2px; text-align: center;';
                northArrow.innerHTML = '<div style="font-size: 16pt;">↑</div><div style="font-size: 8pt;">N</div>';
                mapContainer.appendChild(northArrow);
            }
            printContainer.appendChild(mapContainer);

            // Add legend if requested
            if (includeLegend) {
                var legend = document.createElement('div');
                legend.style.cssText = 'margin-top: 5mm; padding: 3mm; border: 1px solid #ccc; font-size: 9pt;';
                legend.innerHTML = '<div style="font-weight: bold; margin-bottom: 2mm;">Legende</div>' +
                    '<div style="display: flex; gap: 10mm; flex-wrap: wrap;">' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #4CAF50; border-radius: 50%; margin-right: 2mm;"></span>In Betrieb</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #FF9800; border-radius: 50%; margin-right: 2mm;"></span>In Renovation</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #2196F3; border-radius: 50%; margin-right: 2mm;"></span>In Planung</span>' +
                    '<span><span style="display: inline-block; width: 10px; height: 10px; background: #9E9E9E; border-radius: 50%; margin-right: 2mm;"></span>Ausser Betrieb</span>' +
                    '</div>';
                printContainer.appendChild(legend);
            }

            // Add footer
            var footer = document.createElement('div');
            footer.style.cssText = 'margin-top: 3mm; padding-top: 3mm; border-top: 1px solid #ccc; font-size: 8pt; color: #666; display: flex; justify-content: space-between;';
            footer.innerHTML = '<span>Quelle: BBL Immobilienportfolio</span><span>© ' + new Date().getFullYear() + ' Bundesamt für Bauten und Logistik</span>';
            printContainer.appendChild(footer);

            document.body.appendChild(printContainer);

            // Create print-specific styles
            var printStyles = document.createElement('style');
            printStyles.id = 'print-styles';
            printStyles.textContent = '@media print { body > *:not(#print-container) { display: none !important; } #print-container { position: static !important; } @page { size: ' + (orientation.includes('landscape') ? 'landscape' : 'portrait') + '; margin: 0; } }';
            document.head.appendChild(printStyles);

            // Trigger print dialog
            setTimeout(function() {
                window.print();

                // Cleanup after print dialog closes
                setTimeout(function() {
                    document.body.removeChild(printContainer);
                    document.head.removeChild(printStyles);
                    btn.textContent = originalText;
                    btn.disabled = false;
                }, 500);
            }, 100);
        }

        function getPrintDimensions(orientation) {
            var dimensions = {
                'portrait-a4': { width: 210, height: 297 },
                'landscape-a4': { width: 297, height: 210 },
                'portrait-a3': { width: 297, height: 420 },
                'landscape-a3': { width: 420, height: 297 }
            };
            return dimensions[orientation] || dimensions['landscape-a4'];
        }

        function getMapScale() {
            if (!map) return 25000;
            var center = map.getCenter();
            var zoom = map.getZoom();
            // Calculate approximate scale based on zoom level at given latitude
            var metersPerPixel = 156543.03392 * Math.cos(center.lat * Math.PI / 180) / Math.pow(2, zoom);
            // Assume 96 DPI screen
            var pixelsPerMeter = 96 / 0.0254;
            return Math.round(metersPerPixel * pixelsPerMeter);
        }

        function createCoordinateGrid() {
            // Create a simple SVG grid overlay
            return '<svg width="100%" height="100%" style="position: absolute; top: 0; left: 0;">' +
                '<defs><pattern id="grid" width="50" height="50" patternUnits="userSpaceOnUse">' +
                '<path d="M 50 0 L 0 0 0 50" fill="none" stroke="rgba(0,0,0,0.15)" stroke-width="0.5"/>' +
                '</pattern></defs>' +
                '<rect width="100%" height="100%" fill="url(#grid)"/>' +
                '</svg>';
        }

        // ===== PRINT PREVIEW OVERLAY =====
        var printPreviewOverlay = null;

        function createPrintPreviewOverlay() {
            if (printPreviewOverlay) return;

            var mapView = document.getElementById('map-view');
            if (!mapView) return;

            printPreviewOverlay = document.createElement('div');
            printPreviewOverlay.className = 'print-preview-overlay';
            printPreviewOverlay.innerHTML = '<svg><defs><mask id="print-preview-mask"><rect width="100%" height="100%" fill="white"/><rect id="print-crop-rect" fill="black"/></mask></defs><rect width="100%" height="100%" fill="rgba(0,0,0,0.5)" mask="url(#print-preview-mask)"/></svg><div class="print-preview-crop"><div class="print-preview-label"></div></div>';
            mapView.appendChild(printPreviewOverlay);
        }

        function showPrintPreview() {
            createPrintPreviewOverlay();
            if (printPreviewOverlay) {
                printPreviewOverlay.classList.add('active');
                updatePrintPreview();
            }
        }

        function hidePrintPreview() {
            if (printPreviewOverlay) {
                printPreviewOverlay.classList.remove('active');
            }
        }

        function updatePrintPreview() {
            if (!printPreviewOverlay || !printPreviewOverlay.classList.contains('active')) return;

            var mapView = document.getElementById('map-view');
            if (!mapView) return;

            var orientation = document.getElementById('print-orientation').value;
            var printDims = getPrintDimensions(orientation);
            var aspectRatio = printDims.width / printDims.height;

            var viewRect = mapView.getBoundingClientRect();
            var viewWidth = viewRect.width;
            var viewHeight = viewRect.height;

            // Calculate print area dimensions to fit in map view (with padding)
            var padding = 60;
            var maxWidth = viewWidth - (padding * 2);
            var maxHeight = viewHeight - (padding * 2);

            var cropWidth, cropHeight;
            if (maxWidth / aspectRatio <= maxHeight) {
                cropWidth = maxWidth;
                cropHeight = maxWidth / aspectRatio;
            } else {
                cropHeight = maxHeight;
                cropWidth = maxHeight * aspectRatio;
            }

            // Center the crop area
            var cropX = (viewWidth - cropWidth) / 2;
            var cropY = (viewHeight - cropHeight) / 2;

            // Update SVG mask rectangle
            var maskRect = printPreviewOverlay.querySelector('#print-crop-rect');
            if (maskRect) {
                maskRect.setAttribute('x', cropX);
                maskRect.setAttribute('y', cropY);
                maskRect.setAttribute('width', cropWidth);
                maskRect.setAttribute('height', cropHeight);
            }

            // Update crop border element
            var cropBorder = printPreviewOverlay.querySelector('.print-preview-crop');
            if (cropBorder) {
                cropBorder.style.left = cropX + 'px';
                cropBorder.style.top = cropY + 'px';
                cropBorder.style.width = cropWidth + 'px';
                cropBorder.style.height = cropHeight + 'px';
            }

            // Update label
            var label = printPreviewOverlay.querySelector('.print-preview-label');
            if (label) {
                var formatLabel = orientation.includes('a3') ? 'A3' : 'A4';
                var orientLabel = orientation.includes('landscape') ? 'Querformat' : 'Hochformat';
                label.textContent = formatLabel + ' ' + orientLabel;
            }
        }


        // Daten laden (parallel fetch of all entity files with error handling)
        function loadAllData() {
            showLoadingOverlay('Daten werden geladen...');

            Promise.all([
                fetchWithErrorHandling('data/buildings.geojson'),
                fetchWithErrorHandling('data/parcels.geojson'),
                fetchOptional('data/furniture.geojson'),
                fetchOptional('data/trees.geojson'),
                fetchOptional('data/green-areas.geojson'),
                fetchOptional('data/care-profiles.json'),
                fetchOptional('data/contacts.json'),
                fetchOptional('data/contracts.json'),
                fetchOptional('data/costs.json'),
                fetchOptional('data/documents.json'),
                fetchOptional('data/species.json'),
                fetchOptional('data/inspections.json'),
                fetchOptional('data/tasks.json'),
                fetchOptional('data/plantings.geojson'),
                fetchOptional('data/lawns.geojson'),
                fetchOptional('data/sites.geojson'),
                fetchOptional('data/surfaces.geojson'),
                fetchOptional('data/gardens.geojson')
            ])
                .then(function(results) {
                    portfolioData = results[0];
                    parcelData = results[1];
                    furnitureData = results[2];
                    treeData = results[3];
                    greenAreaData = results[4];

                    // Extended data
                    var cpRaw = results[5];
                    careProfileData = cpRaw && cpRaw.careProfiles ? cpRaw.careProfiles : (Array.isArray(cpRaw) ? cpRaw : []);
                    var ctRaw = results[6];
                    contactData = ctRaw && ctRaw.contacts ? ctRaw.contacts : (Array.isArray(ctRaw) ? ctRaw : []);
                    var crRaw = results[7];
                    contractData = crRaw && crRaw.contracts ? crRaw.contracts : (Array.isArray(crRaw) ? crRaw : []);
                    var coRaw = results[8];
                    costData = coRaw && coRaw.costs ? coRaw.costs : (Array.isArray(coRaw) ? coRaw : []);
                    var doRaw = results[9];
                    documentData = doRaw && doRaw.documents ? doRaw.documents : (Array.isArray(doRaw) ? doRaw : []);
                    var spRaw = results[10];
                    speciesData = spRaw && spRaw.species ? spRaw.species : (Array.isArray(spRaw) ? spRaw : []);
                    var inRaw = results[11];
                    inspectionData = inRaw && inRaw.inspections ? inRaw.inspections : (Array.isArray(inRaw) ? inRaw : []);
                    var taRaw = results[12];
                    taskData = taRaw && taRaw.tasks ? taRaw.tasks : (Array.isArray(taRaw) ? taRaw : []);
                    plantingData = results[13];
                    var lawnsRaw = results[14];
                    sitesData = results[15];
                    surfaceData = results[16];
                    gardenData = results[17];

                    // Use lawns data as greenAreaData if green-areas.geojson didn't load
                    if (!greenAreaData && lawnsRaw && lawnsRaw.features) {
                        greenAreaData = lawnsRaw;
                    }

                    // Validate portfolio data
                    if (!portfolioData || !portfolioData.features) {
                        throw new Error('Ungültiges Datenformat: Gebäudedaten fehlen');
                    }

                    // Initialize filters from URL
                    activeFilters = getFiltersFromURL();

                    // Initialize filter pane with options
                    initFilterOptions();
                    initFilterPane();
                    initDrawerResize();
                    initExportPanel();

                    // Apply initial filters (this sets filteredData and updates count)
                    applyFilters();

                    // Always use the load event to avoid race conditions
                    // If already loaded, the callback fires immediately
                    if (map.loaded()) {
                        addMapLayers();
                        syncLayerVisibilityWithCheckboxes();
                    } else {
                        map.once('load', function() {
                            addMapLayers();
                            syncLayerVisibilityWithCheckboxes();
                        });
                    }

                    // Check if URL specifies a view
                    var initialView = getViewFromURL();
                    if (initialView && initialView !== 'map' && initialView !== 'detail') {
                        switchView(initialView);
                    } else {
                        // Map view is default - show style switcher
                        var styleSwitcher = document.getElementById('style-switcher');
                        if (styleSwitcher) {
                            styleSwitcher.classList.add('visible');
                        }
                    }

                    // Hide loading overlay on success
                    hideLoadingOverlay();
                })
                .catch(function(error) {
                    console.error('Fehler beim Laden der Daten:', error);
                    hideLoadingOverlay();

                    // Show user-friendly error with retry option
                    showError(
                        'Fehler beim Laden der Daten',
                        'Die Portfoliodaten konnten nicht geladen werden. Bitte überprüfen Sie Ihre Internetverbindung.',
                        function() {
                            loadAllData(); // Retry
                        }
                    );
                });
        }

        // Start initial data load
        loadAllData();
        
        // ===== VIEW MANAGEMENT =====
        var currentView = 'map';
        
        function getViewFromURL() {
            var params = new URLSearchParams(window.location.search);
            return params.get('view') || 'map';
        }
        
        function setViewInURL(view) {
            var url = new URL(window.location);
            url.searchParams.set('view', view);
            url.searchParams.delete('id');
            url.searchParams.delete('tab');
            window.history.pushState({}, '', url);
        }
        
        function switchView(view) {
            currentView = view;
            setViewInURL(view);
            
            // Update toggle buttons and ARIA attributes
            document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
                btn.classList.remove('active');
                btn.setAttribute('aria-selected', 'false');
                if (btn.dataset.view === view) {
                    btn.classList.add('active');
                    btn.setAttribute('aria-selected', 'true');
                }
            });
            
            // Show/hide views
            document.getElementById('map-view').classList.remove('active');
            document.getElementById('wiki-view').classList.remove('active');
            document.getElementById('tasks-view').classList.remove('active');
            document.getElementById('dashboard-view').classList.remove('active');
            document.getElementById('settings-view').classList.remove('active');
            document.getElementById('api-view').classList.remove('active');

            var viewElement = document.getElementById(view + '-view');
            if (viewElement) {
                viewElement.classList.add('active');
            }

            // Toggle settings button active state
            var settingsBtn = document.getElementById('project-settings-btn');
            if (settingsBtn) {
                settingsBtn.classList.toggle('panel-open', view === 'settings');
            }

            // Show/hide style switcher based on view (only visible in map view)
            var styleSwitcher = document.getElementById('style-switcher');
            if (styleSwitcher) {
                styleSwitcher.classList.toggle('visible', view === 'map');
            }

            // Resize map if switching to map view
            if (view === 'map' && window.map) {
                setTimeout(function() {
                    map.resize();
                    // Apply filters to map when switching to map view
                    if (map.getLayer('buildings-fill')) {
                        updateMapFilter();
                    }
                }, 100);
            }

            // Render dynamic views
            if (view === 'tasks') {
                renderTasksView();
            } else if (view === 'dashboard') {
                renderDashboardView();
            }
        }

        // View toggle click handlers
        document.querySelectorAll('.view-toggle-btn').forEach(function(btn) {
            btn.addEventListener('click', function() {
                switchView(this.dataset.view);
            });
        });
        
        // Handle browser back/forward
        window.addEventListener('popstate', function() {
            var view = getViewFromURL();
            if (view && view !== 'detail') {
                switchView(view);
            }
        });
        
        // ===== INITIALIZE MAP =====

        // Map style definitions (defined early for use in map initialization)
        var mapStyles = {
            'light-v11': { name: 'Light', url: 'mapbox://styles/mapbox/light-v11' },
            'streets-v12': { name: 'Standard', url: 'mapbox://styles/mapbox/streets-v12' },
            'satellite-v9': { name: 'Luftbild', url: 'mapbox://styles/mapbox/satellite-v9' },
            'satellite-streets-v12': { name: 'Hybrid', url: 'mapbox://styles/mapbox/satellite-streets-v12' }
        };

        // Load saved map style from localStorage (default to light-v11)
        var currentMapStyle = localStorage.getItem('mapStyle') || 'light-v11';
        // Validate saved style exists, fallback to default if invalid
        if (!mapStyles[currentMapStyle]) {
            currentMapStyle = 'light-v11';
        }

        // 1. Parse URL parameters for map state
        var urlParams = new URLSearchParams(window.location.search);
        var initialLat = parseFloat(urlParams.get('lat'));
        var initialLng = parseFloat(urlParams.get('lng'));
        var initialZoom = parseFloat(urlParams.get('zoom'));

        // Defaults (Switzerland)
        var startCenter = [8.2275, 46.8182];
        var startZoom = 2;

        // Override defaults if URL params exist
        if (!isNaN(initialLat) && !isNaN(initialLng) && !isNaN(initialZoom)) {
            startCenter = [initialLng, initialLat];
            startZoom = initialZoom;
        }

        var map = new mapboxgl.Map({
            container: 'map',
            style: mapStyles[currentMapStyle].url,
            center: startCenter,
            zoom: startZoom,
            dragRotate: false,
            customAttribution: '&copy; swisstopo'
        });

        // Middle mouse button drag to rotate/pitch
        (function setupMiddleMouseRotate() {
            var dragging = false;
            var lastX, lastY;
            var mapCanvas = map.getCanvas();

            mapCanvas.addEventListener('mousedown', function(e) {
                if (e.button !== 1) return;
                e.preventDefault();
                dragging = true;
                lastX = e.clientX;
                lastY = e.clientY;
                mapCanvas.style.cursor = 'grabbing';
            });

            window.addEventListener('mousemove', function(e) {
                if (!dragging) return;
                var dx = e.clientX - lastX;
                var dy = e.clientY - lastY;
                lastX = e.clientX;
                lastY = e.clientY;
                var bearing = map.getBearing() + dx * 0.5;
                var pitch = Math.max(0, Math.min(85, map.getPitch() - dy * 0.5));
                map.jumpTo({ bearing: bearing, pitch: pitch });
            });

            window.addEventListener('mouseup', function(e) {
                if (e.button !== 1) return;
                dragging = false;
                mapCanvas.style.cursor = '';
            });
        })();

        map.addControl(new mapboxgl.NavigationControl(), 'top-right');
        map.addControl(new mapboxgl.ScaleControl({ maxWidth: 200 }), 'bottom-left');

        // Home button control
        var HomeControl = function() {};
        HomeControl.prototype.onAdd = function(map) {
            this._map = map;
            this._container = document.createElement('div');
            this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

            var button = document.createElement('button');
            button.className = 'map-home-btn';
            button.type = 'button';
            button.title = 'Zur Startansicht';
            button.innerHTML = '<span class="material-symbols-outlined">home</span>';
            button.onclick = function() {
                map.flyTo({
                    center: [8.2275, 46.8182],
                    zoom: 2,
                    duration: 1000
                });
            };

            this._container.appendChild(button);
            return this._container;
        };
        HomeControl.prototype.onRemove = function() {
            this._container.parentNode.removeChild(this._container);
            this._map = undefined;
        };

        map.addControl(new HomeControl(), 'top-right');

        // 3D toggle control
        var Toggle3DControl = function() {};
        Toggle3DControl.prototype.onAdd = function(map) {
            this._map = map;
            this._active = false;
            this._container = document.createElement('div');
            this._container.className = 'mapboxgl-ctrl mapboxgl-ctrl-group';

            var button = document.createElement('button');
            button.className = 'map-3d-btn';
            button.type = 'button';
            button.title = '3D-Ansicht umschalten';
            button.textContent = '3D';
            var self = this;
            button.onclick = function() {
                self._active = !self._active;
                button.classList.toggle('active', self._active);
                button.textContent = self._active ? '2D' : '3D';
                if (self._active) {
                    map.easeTo({ pitch: 60, duration: 600 });
                } else {
                    map.easeTo({ pitch: 0, bearing: 0, duration: 600 });
                }
            };

            this._container.appendChild(button);
            return this._container;
        };
        Toggle3DControl.prototype.onRemove = function() {
            this._container.parentNode.removeChild(this._container);
            this._map = undefined;
        };

        map.addControl(new Toggle3DControl(), 'top-right');

        // ===== DARGESTELLTE KARTEN (Layer Management in Accordion) =====
        (function setupDargestellteKarten() {
            var accordion = document.getElementById('dargestellte-karten-content');
            if (!accordion) return;

            // Reference layer configuration (recommended swisstopo layers)
            var referenceLayerConfig = [
                { id: 'ch.swisstopo-vd.stand-oerebkataster', name: 'Verfügbarkeit ÖREB-Kataster' },
                { id: 'ch.swisstopo-vd.amtliche-vermessung', name: 'Amtliche Vermessung' },
                { id: 'ch.bav.kataster-belasteter-standorte-oev', name: 'Kataster der belasteten Standorte' },
                { id: 'ch.bafu.landesforstinventar-vegetationshoehenmodell', name: 'Vegetationshöhe LFI' }
            ];
            var referenceLayerIds = referenceLayerConfig.map(function(r) { return r.id; });

            // Built-in project layer IDs for toggling
            var projectLayerMap = {
                'buildings': ['buildings-fill', 'buildings-outline', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'buildings-cluster', 'buildings-cluster-count'],
                'lawns': ['lawns-fill', 'lawns-outline'],
                'parcels': ['parcels-fill', 'parcels-outline', 'parcels-highlight'],
                'surfaces': ['surfaces-fill', 'surfaces-outline'],
                'gardens': ['gardens-fill', 'gardens-outline'],
                'furniture': ['furniture-points'],
                'trees': ['trees-points']
            };

            // --- Project layer checkbox handlers ---
            accordion.querySelectorAll('.layer-item[data-layer] input[type="checkbox"]').forEach(function(cb) {
                cb.addEventListener('change', function() {
                    var layerId = this.closest('.layer-item').dataset.layer;
                    var layerIds = projectLayerMap[layerId];
                    if (!layerIds) return;

                    var visibility = this.checked ? 'visible' : 'none';
                    layerIds.forEach(function(id) {
                        if (map.getLayer(id)) {
                            map.setLayoutProperty(id, 'visibility', visibility);
                        }
                    });
                });
            });

            // --- Project layer info buttons ---
            accordion.querySelectorAll('.layer-info-btn[data-layer]').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    showLayerInfo(btn.dataset.layer);
                });
            });

            // --- Render reference layers list ---
            window.renderReferenceLayersList = function() {
                var container = document.getElementById('reference-layers-list');
                if (!container) return;

                var html = '';

                // 1. Render recommended reference layers (always shown)
                referenceLayerConfig.forEach(function(ref) {
                    var activeLayer = activeSwisstopoLayers.find(function(l) { return l.id === ref.id; });
                    var isActive = !!activeLayer;
                    var isVisible = isActive && activeLayer.visible !== false;
                    if (isActive && map.getLayer(activeLayer.mapLayerId)) {
                        var vis = map.getLayoutProperty(activeLayer.mapLayerId, 'visibility');
                        isVisible = vis !== 'none';
                    }
                    var escapedId = ref.id.replace(/'/g, "\\'");

                    html += '<div class="layer-item" data-layer="' + ref.id + '">';

                    // X remove button (only when active)
                    if (isActive) {
                        html += '<button class="layer-remove-btn" data-layer="' + ref.id + '" title="Entfernen">' +
                            '<span class="material-symbols-outlined">close</span></button>';
                    }

                    // Checkbox
                    html += '<input type="checkbox" ' + (isActive && isVisible ? 'checked' : '') +
                        ' data-layer="' + ref.id + '" data-ref="true">';

                    // Name
                    html += '<span class="layer-name">' + ref.name + '</span>';

                    // Info button
                    html += '<div class="layer-actions">' +
                        '<button class="layer-info-btn" data-layer="' + ref.id + '" title="Layer-Info">' +
                        '<span class="material-symbols-outlined">info</span></button></div>';

                    html += '</div>';
                });

                // 2. Render additional active layers from Geokatalog (not in recommended list)
                activeSwisstopoLayers.forEach(function(layer) {
                    if (referenceLayerIds.indexOf(layer.id) !== -1) return; // Skip recommended layers

                    var isVisible;
                    if (map.getLayer(layer.mapLayerId)) {
                        var vis = map.getLayoutProperty(layer.mapLayerId, 'visibility');
                        isVisible = vis !== 'none';
                    } else {
                        isVisible = layer.visible !== false;
                    }

                    html += '<div class="layer-item" data-layer="' + layer.id + '">';
                    html += '<button class="layer-remove-btn" data-layer="' + layer.id + '" title="Entfernen">' +
                        '<span class="material-symbols-outlined">close</span></button>';
                    html += '<input type="checkbox" ' + (isVisible ? 'checked' : '') +
                        ' data-layer="' + layer.id + '" data-ref="true" data-extra="true">';
                    html += '<span class="layer-name">' + escapeHtml(layer.title) + '</span>';
                    html += '<div class="layer-actions">' +
                        '<button class="layer-info-btn" data-layer="' + layer.id + '" title="Layer-Info">' +
                        '<span class="material-symbols-outlined">info</span></button></div>';
                    html += '</div>';
                });

                container.innerHTML = html;

                // Bind event handlers for dynamically rendered elements

                // Remove buttons
                container.querySelectorAll('.layer-remove-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var layerId = this.dataset.layer;
                        removeSwisstopoLayer(layerId);
                    });
                });

                // Checkboxes
                container.querySelectorAll('input[type="checkbox"][data-ref]').forEach(function(cb) {
                    cb.addEventListener('change', function() {
                        var layerId = this.dataset.layer;
                        var activeLayer = activeSwisstopoLayers.find(function(l) { return l.id === layerId; });

                        if (this.checked) {
                            if (!activeLayer) {
                                // Layer not yet loaded — add it
                                var config = referenceLayerConfig.find(function(r) { return r.id === layerId; });
                                addSwisstopoLayer(layerId, config ? config.name : layerId, true);
                            } else {
                                // Layer loaded but hidden — show it
                                toggleSwisstopoLayerVisibility(layerId);
                            }
                        } else {
                            if (activeLayer) {
                                // Layer loaded and visible — hide it
                                toggleSwisstopoLayerVisibility(layerId);
                            }
                        }
                    });
                });

                // Info buttons
                container.querySelectorAll('.layer-info-btn').forEach(function(btn) {
                    btn.addEventListener('click', function(e) {
                        e.preventDefault();
                        e.stopPropagation();
                        showLayerInfo(this.dataset.layer);
                    });
                });

                // Sync Geokatalog checkboxes
                updateGeokatalogCheckboxes();
            };

            // Initial render
            renderReferenceLayersList();

            // ===== EDIT MODE =====
            var editToolbar = document.getElementById('edit-toolbar');
            var editBanner = document.getElementById('edit-banner');
            var editBannerLayerName = document.getElementById('edit-banner-layer-name');
            var activeEditLayer = null;
            var activeEditTool = null;

            // Layer display names
            var layerDisplayNames = {
                'buildings': 'Gebäude',
                'lawns': 'Rasen & Wiesen',
                'parcels': 'Grundstücke',
                'furniture': 'Mobiliar',
                'trees': 'Bäume'
            };

            // Tools allowed per geometry type
            var toolsByGeometry = {
                'Point': ['draw-point', 'edit-vertices', 'delete', 'undo', 'redo'],
                'Polygon': ['draw-polygon', 'edit-vertices', 'split', 'merge', 'delete', 'undo', 'redo'],
                'LineString': ['draw-line', 'edit-vertices', 'split', 'merge', 'delete', 'undo', 'redo']
            };

            // Show/hide toolbar buttons based on geometry type
            function updateToolbarForGeometry(geometryType) {
                var allowed = toolsByGeometry[geometryType] || Object.keys(toolsByGeometry).reduce(function(all, k) {
                    return all.concat(toolsByGeometry[k]);
                }, []);
                editToolbar.querySelectorAll('.edit-tool-btn').forEach(function(btn) {
                    var tool = btn.dataset.tool;
                    btn.style.display = allowed.indexOf(tool) !== -1 ? '' : 'none';
                });
                // Hide empty dividers (when all tools in a group are hidden)
                editToolbar.querySelectorAll('.edit-tool-group').forEach(function(group) {
                    var hasVisible = Array.prototype.some.call(group.querySelectorAll('.edit-tool-btn'), function(btn) {
                        return btn.style.display !== 'none';
                    });
                    group.style.display = hasVisible ? '' : 'none';
                });
                editToolbar.querySelectorAll('.edit-tool-divider').forEach(function(div) {
                    var prev = div.previousElementSibling;
                    var next = div.nextElementSibling;
                    var prevVisible = prev && prev.style.display !== 'none';
                    var nextVisible = next && next.style.display !== 'none';
                    div.style.display = (prevVisible && nextVisible) ? '' : 'none';
                });
            }

            // Edit button click — toggle edit toolbar for that layer
            accordion.querySelectorAll('.layer-edit-btn').forEach(function(btn) {
                btn.addEventListener('click', function(e) {
                    e.preventDefault();
                    e.stopPropagation();
                    var layerId = this.dataset.layer;

                    // If already editing this layer, close
                    if (activeEditLayer === layerId) {
                        closeEditMode();
                        return;
                    }

                    // Clear previous active state
                    accordion.querySelectorAll('.layer-edit-btn').forEach(function(b) {
                        b.classList.remove('active');
                    });

                    // Activate this edit button
                    this.classList.add('active');
                    activeEditLayer = layerId;
                    activeEditTool = null;

                    // Determine geometry type from cached layerInfo or loaded data
                    var geometryType = null;
                    if (layerInfoCache[layerId]) {
                        geometryType = layerInfoCache[layerId].info.geometryType;
                    }
                    updateToolbarForGeometry(geometryType);

                    // Update banner and show toolbar + banner
                    editBannerLayerName.textContent = (layerDisplayNames[layerId] || layerId) + ' bearbeiten';
                    editBanner.classList.add('visible');
                    editToolbar.classList.add('visible');

                    // Clear active tool states
                    editToolbar.querySelectorAll('.edit-tool-btn').forEach(function(t) {
                        t.classList.remove('active');
                    });
                });
            });

            // Edit tool selection
            editToolbar.querySelectorAll('.edit-tool-btn').forEach(function(btn) {
                btn.addEventListener('click', function() {
                    var tool = this.dataset.tool;

                    // Undo/Redo are instant actions, don't toggle
                    if (tool === 'undo' || tool === 'redo') {
                        return;
                    }

                    // Toggle tool selection
                    if (activeEditTool === tool) {
                        this.classList.remove('active');
                        activeEditTool = null;
                    } else {
                        editToolbar.querySelectorAll('.edit-tool-btn').forEach(function(t) {
                            t.classList.remove('active');
                        });
                        this.classList.add('active');
                        activeEditTool = tool;
                    }
                });
            });

            // Close edit mode
            function closeEditMode() {
                activeEditLayer = null;
                activeEditTool = null;
                editToolbar.classList.remove('visible');
                editBanner.classList.remove('visible');
                accordion.querySelectorAll('.layer-edit-btn').forEach(function(b) {
                    b.classList.remove('active');
                });
            }

            // Banner cancel button
            document.getElementById('edit-banner-cancel').addEventListener('click', function() {
                closeEditMode();
            });

            // Banner save button
            document.getElementById('edit-banner-save').addEventListener('click', function() {
                // Placeholder: save logic will go here
                closeEditMode();
            });
        })();

        // 2. Update URL on map move/zoom
        map.on('moveend', function() {
            if (currentView !== 'map') return; // Don't update if not in map view
            
            var center = map.getCenter();
            var zoom = map.getZoom();
            
            var url = new URL(window.location);
            url.searchParams.set('lng', center.lng.toFixed(5));
            url.searchParams.set('lat', center.lat.toFixed(5));
            url.searchParams.set('zoom', zoom.toFixed(2));
            
            // Use replaceState to update URL without adding to history stack
            window.history.replaceState({}, '', url);
        });

        map.on('mousemove', function(e) {
            var lng = e.lngLat.lng.toFixed(5);
            var lat = e.lngLat.lat.toFixed(5);
            document.getElementById('coordinates').textContent = 'WGS 84 | Koordinaten: ' + lng + ', ' + lat;
        });
        
        // ===== SWISSTOPO LAYER MANAGEMENT =====

        function addSwisstopoLayer(layerId, title, silent) {
            if (!layerId) {
                if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Keine Layer-ID vorhanden.' });
                return;
            }

            // Validate layer ID format (alphanumeric, dots, hyphens, underscores only)
            if (!/^[a-zA-Z0-9._-]+$/.test(layerId)) {
                if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Ungültige Layer-ID.' });
                return;
            }

            // Check if layer already added
            var existing = activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
            if (existing) {
                if (!silent) showToast({ type: 'info', title: 'Hinweis', message: 'Layer "' + title + '" ist bereits aktiv.' });
                return;
            }

            // Cancel any pending fetch for this layer
            if (pendingLayerFetches[layerId]) {
                pendingLayerFetches[layerId].abort();
                delete pendingLayerFetches[layerId];
            }

            // Create AbortController for this fetch
            var abortController = new AbortController();
            pendingLayerFetches[layerId] = abortController;

            // Show loading toast
            if (!silent) showToast({ type: 'info', title: 'Lade Layer...', message: 'Metadaten werden abgerufen.', duration: 2000 });

            // Fetch layer metadata to get correct format and timestamp
            fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + layerId + '?lang=de', { signal: abortController.signal })
                .then(function(response) {
                    if (!response.ok) throw new Error('Layer-Metadaten nicht verfügbar');
                    return response.json();
                })
                .then(function(metadata) {
                    // Clean up pending fetch reference
                    delete pendingLayerFetches[layerId];

                    // Check if layer was removed while fetching
                    if (!pendingLayerFetches.hasOwnProperty(layerId) && activeSwisstopoLayers.find(function(l) { return l.id === layerId; })) {
                        return; // Layer was removed during fetch
                    }

                    var sourceId = 'swisstopo-' + layerId;
                    var mapLayerId = 'swisstopo-layer-' + layerId;
                    var tileUrl;
                    var maxZoom = 18;

                    // Check if layer supports WMTS (has format specified)
                    if (metadata.format) {
                        // Use WMTS (faster, pre-rendered tiles)
                        var tileFormat = metadata.format.replace('image/', '');
                        var timestamp = 'current';
                        if (metadata.timestamps && metadata.timestamps.length > 0) {
                            timestamp = metadata.timestamps[0];
                        }
                        tileUrl = 'https://wmts.geo.admin.ch/1.0.0/' + layerId + '/default/' + timestamp + '/3857/{z}/{x}/{y}.' + tileFormat;

                        if (metadata.maxScale) {
                            maxZoom = Math.min(22, Math.max(0, Math.round(18 - Math.log2(metadata.maxScale / 500))));
                        }
                    } else {
                        // Fall back to WMS (supports all layers with on-the-fly reprojection)
                        tileUrl = 'https://wms.geo.admin.ch/?' +
                            'SERVICE=WMS&VERSION=1.3.0&REQUEST=GetMap' +
                            '&LAYERS=' + layerId +
                            '&CRS=EPSG:3857' +
                            '&BBOX={bbox-epsg-3857}' +
                            '&WIDTH=256&HEIGHT=256' +
                            '&FORMAT=image/png' +
                            '&TRANSPARENT=true';
                        maxZoom = 19; // WMS typically supports higher zoom
                    }

                    try {
                        // Add raster source
                        map.addSource(sourceId, {
                            type: 'raster',
                            tiles: [tileUrl],
                            tileSize: 256,
                            maxzoom: maxZoom,
                            attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
                        });

                        // Find the layer to insert before (below highlight layer, parcels, and points)
                        var beforeLayer = null;
                        if (map.getLayer(identifyHighlightLayerId)) {
                            beforeLayer = identifyHighlightLayerId;
                        } else if (map.getLayer('parcels-fill')) {
                            beforeLayer = 'parcels-fill';
                        } else if (map.getLayer('buildings-fill')) {
                            beforeLayer = 'buildings-fill';
                        }

                        // Add raster layer
                        map.addLayer({
                            id: mapLayerId,
                            type: 'raster',
                            source: sourceId,
                            paint: {
                                'raster-opacity': 0.7
                            }
                        }, beforeLayer);
                    } catch (e) {
                        console.error('Fehler beim Hinzufügen des Layers zur Karte:', e);
                        if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Layer "' + (title || layerId) + '" konnte nicht zur Karte hinzugefügt werden.' });
                        return;
                    }

                    // Track the layer (including tileUrl, maxZoom, and visibility for re-adding after style change)
                    activeSwisstopoLayers.push({
                        id: layerId,
                        title: title || layerId,
                        sourceId: sourceId,
                        mapLayerId: mapLayerId,
                        tileUrl: tileUrl,
                        maxZoom: maxZoom,
                        visible: true
                    });

                    // Update the UI and URL
                    renderActiveLayersList();
                    updateUrlWithLayers();

                    if (!silent) showToast({ type: 'success', title: 'Layer hinzugefügt', message: '"' + (title || layerId) + '" wurde zur Karte hinzugefügt.' });
                })
                .catch(function(e) {
                    // Clean up pending fetch reference
                    delete pendingLayerFetches[layerId];

                    // Ignore abort errors (user cancelled)
                    if (e.name === 'AbortError') return;

                    console.error('Fehler beim Hinzufügen des Layers:', e);
                    if (!silent) showToast({ type: 'error', title: 'Fehler', message: 'Layer "' + (title || layerId) + '" konnte nicht geladen werden.' });
                });
        }

        window.removeSwisstopoLayer = function(layerId) {
            // Cancel any pending fetch for this layer
            if (pendingLayerFetches[layerId]) {
                pendingLayerFetches[layerId].abort();
                delete pendingLayerFetches[layerId];
            }

            var layerIndex = activeSwisstopoLayers.findIndex(function(l) { return l.id === layerId; });
            if (layerIndex === -1) return;

            var layer = activeSwisstopoLayers[layerIndex];

            try {
                if (map.getLayer(layer.mapLayerId)) {
                    map.removeLayer(layer.mapLayerId);
                }
                if (map.getSource(layer.sourceId)) {
                    map.removeSource(layer.sourceId);
                }
            } catch (e) {
                console.error('Fehler beim Entfernen des Layers:', e);
            }

            activeSwisstopoLayers.splice(layerIndex, 1);
            renderActiveLayersList();
            updateUrlWithLayers();

            showToast({ type: 'info', title: 'Layer entfernt', message: '"' + layer.title + '" wurde entfernt.' });
        };

        window.toggleSwisstopoLayerVisibility = function(layerId) {
            var layer = activeSwisstopoLayers.find(function(l) { return l.id === layerId; });
            if (!layer) return;

            // Check if map layer exists
            if (!map.getLayer(layer.mapLayerId)) {
                console.warn('Map layer not found:', layer.mapLayerId);
                return;
            }

            var visibility = map.getLayoutProperty(layer.mapLayerId, 'visibility');
            var newVisibility = visibility === 'none' ? 'visible' : 'none';
            map.setLayoutProperty(layer.mapLayerId, 'visibility', newVisibility);

            // Track visibility state for style change restoration
            layer.visible = newVisibility !== 'none';

            renderActiveLayersList();
        };

        function renderActiveLayersList() {
            // Delegate to the accordion-based reference layers renderer
            if (typeof renderReferenceLayersList === 'function') {
                renderReferenceLayersList();
            }
        }

        function readdSwisstopoLayers() {
            // Re-add all Swisstopo layers after a map style change
            if (activeSwisstopoLayers.length === 0) return;

            activeSwisstopoLayers.forEach(function(layer) {
                // Skip if source already exists (shouldn't happen, but safety check)
                if (map.getSource(layer.sourceId)) return;

                try {
                    // Re-add raster source
                    map.addSource(layer.sourceId, {
                        type: 'raster',
                        tiles: [layer.tileUrl],
                        tileSize: 256,
                        maxzoom: layer.maxZoom,
                        attribution: '&copy; <a href="https://www.swisstopo.admin.ch">swisstopo</a>'
                    });

                    // Find the layer to insert before
                    var beforeLayer = null;
                    if (map.getLayer(identifyHighlightLayerId)) {
                        beforeLayer = identifyHighlightLayerId;
                    } else if (map.getLayer('parcels-fill')) {
                        beforeLayer = 'parcels-fill';
                    } else if (map.getLayer('buildings-fill')) {
                        beforeLayer = 'buildings-fill';
                    }

                    // Re-add raster layer with preserved visibility state
                    map.addLayer({
                        id: layer.mapLayerId,
                        type: 'raster',
                        source: layer.sourceId,
                        layout: {
                            visibility: layer.visible !== false ? 'visible' : 'none'
                        },
                        paint: {
                            'raster-opacity': 0.7
                        }
                    }, beforeLayer);
                } catch (e) {
                    console.error('Fehler beim Wiederherstellen des Layers:', layer.id, e);
                }
            });

            // Update checkbox states in UI
            renderActiveLayersList();
        }

        // ===== SWISSTOPO FEATURE IDENTIFICATION =====

        var identifiedFeaturePopup = null;
        var identifyHighlightSourceId = 'swisstopo-identify-highlight';
        var identifyHighlightLayerId = 'swisstopo-identify-highlight-layer';
        var identifyHighlightOutlineLayerId = 'swisstopo-identify-highlight-outline';

        function initIdentifyHighlightLayer() {
            // Add empty source for highlighting identified features
            if (!map.getSource(identifyHighlightSourceId)) {
                map.addSource(identifyHighlightSourceId, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                // Find the layer to insert before (should be above Swisstopo layers, below parcels/points)
                var beforeLayer = null;
                if (map.getLayer('parcels-fill')) {
                    beforeLayer = 'parcels-fill';
                } else if (map.getLayer('buildings-fill')) {
                    beforeLayer = 'buildings-fill';
                }

                // Add fill layer for polygons
                map.addLayer({
                    id: identifyHighlightLayerId,
                    type: 'fill',
                    source: identifyHighlightSourceId,
                    paint: {
                        'fill-color': '#ff6b00',
                        'fill-opacity': 0.35
                    }
                }, beforeLayer);

                // Add outline layer (above fill)
                map.addLayer({
                    id: identifyHighlightOutlineLayerId,
                    type: 'line',
                    source: identifyHighlightSourceId,
                    paint: {
                        'line-color': '#ff6b00',
                        'line-width': 3,
                        'line-opacity': 0.9
                    }
                }, beforeLayer);
            }
        }

        function clearIdentifyHighlight() {
            if (map.getSource(identifyHighlightSourceId)) {
                map.getSource(identifyHighlightSourceId).setData({
                    type: 'FeatureCollection',
                    features: []
                });
            }
            if (identifiedFeaturePopup) {
                // Store reference and null it BEFORE removing to prevent infinite loop
                // (popup.remove() fires 'close' event which would call this function again)
                var popup = identifiedFeaturePopup;
                identifiedFeaturePopup = null;
                popup.remove();
            }
        }

        function identifySwisstopoFeatures(lngLat) {
            // Only identify if there are active layers
            if (activeSwisstopoLayers.length === 0) return;

            // Get visible layer IDs
            var visibleLayers = activeSwisstopoLayers.filter(function(layer) {
                var visibility = map.getLayoutProperty(layer.mapLayerId, 'visibility');
                return visibility !== 'none';
            }).map(function(layer) {
                return layer.id;
            });

            if (visibleLayers.length === 0) return;

            // Build the identify URL
            // Use tolerance=0 for exact point-in-polygon intersection
            // Per API docs: tolerance=0 with mapExtent=0,0,0,0 and imageDisplay=0,0,0 does exact intersection
            var url = 'https://api3.geo.admin.ch/rest/services/all/MapServer/identify?' +
                'geometry=' + lngLat.lng + ',' + lngLat.lat +
                '&geometryType=esriGeometryPoint' +
                '&geometryFormat=geojson' +
                '&sr=4326' +
                '&layers=all:' + visibleLayers.join(',') +
                '&mapExtent=0,0,0,0' +
                '&imageDisplay=0,0,0' +
                '&tolerance=0' +
                '&returnGeometry=true' +
                '&lang=de';

            fetch(url)
                .then(function(response) {
                    if (!response.ok) throw new Error('Identify request failed');
                    return response.json();
                })
                .then(function(data) {
                    if (data.results && data.results.length > 0) {
                        showIdentifiedFeature(data.results[0], lngLat);
                    } else {
                        clearIdentifyHighlight();
                    }
                })
                .catch(function(e) {
                    console.error('Identify error:', e);
                    clearIdentifyHighlight();
                });
        }

        function showIdentifiedFeature(result, lngLat) {
            // Remove existing popup FIRST (before setting new geometry)
            // This prevents the old popup's close event from clearing our new geometry
            if (identifiedFeaturePopup) {
                var oldPopup = identifiedFeaturePopup;
                identifiedFeaturePopup = null;
                oldPopup.remove();
            }

            // Now highlight the geometry (after old popup is gone)
            if (result.geometry) {
                var feature = {
                    type: 'Feature',
                    geometry: result.geometry,
                    properties: result.properties || {}
                };

                if (map.getSource(identifyHighlightSourceId)) {
                    map.getSource(identifyHighlightSourceId).setData({
                        type: 'FeatureCollection',
                        features: [feature]
                    });
                }
            }

            // Build popup content
            var props = result.properties || result.attributes || {};
            var layerName = result.layerName || result.layerBodId || 'Feature';

            var html = '<div class="identify-popup">';
            html += '<div class="identify-popup-header">' + escapeHtml(layerName) + '</div>';
            html += '<div class="identify-popup-content">';

            // Display properties (limit to first 8 for readability)
            var propCount = 0;
            for (var key in props) {
                if (props.hasOwnProperty(key) && propCount < 8) {
                    var value = props[key];
                    // Skip internal/technical fields
                    if (key.startsWith('_') || key === 'id' || key === 'featureId') continue;
                    // Skip null/undefined values
                    if (value === null || value === undefined || value === '') continue;

                    // Format the key (remove underscores, capitalize)
                    var displayKey = key.replace(/_/g, ' ').replace(/\b\w/g, function(l) { return l.toUpperCase(); });

                    html += '<div class="identify-prop">';
                    html += '<span class="identify-prop-key">' + escapeHtml(displayKey) + ':</span> ';
                    html += '<span class="identify-prop-value">' + escapeHtml(String(value)) + '</span>';
                    html += '</div>';
                    propCount++;
                }
            }

            if (propCount === 0) {
                html += '<div class="identify-prop"><em>Keine Attribute verfügbar</em></div>';
            }

            html += '</div></div>';

            // Create and show popup
            identifiedFeaturePopup = new mapboxgl.Popup({
                closeButton: true,
                closeOnClick: false,
                maxWidth: '320px'
            })
                .setLngLat(lngLat)
                .setHTML(html)
                .addTo(map);

            identifiedFeaturePopup.on('close', function() {
                clearIdentifyHighlight();
            });
        }

        // Sync map layer visibility with checkbox state (after style change or initial load)
        function syncLayerVisibilityWithCheckboxes() {
            var accordion = document.getElementById('dargestellte-karten-content');
            if (!accordion) return;

            var projectLayerMap = {
                'buildings': ['buildings-fill', 'buildings-outline', 'buildings-selected', 'buildings-selected-pulse', 'buildings-labels', 'buildings-cluster', 'buildings-cluster-count'],
                'parcels': ['parcels-fill', 'parcels-outline', 'parcels-highlight'],
                'lawns': ['lawns-fill', 'lawns-outline'],
                'surfaces': ['surfaces-fill', 'surfaces-outline'],
                'gardens': ['gardens-fill', 'gardens-outline'],
                'furniture': ['furniture-points'],
                'trees': ['trees-points']
            };

            accordion.querySelectorAll('.layer-item[data-layer] input[type="checkbox"]').forEach(function(cb) {
                var layerId = cb.closest('.layer-item').dataset.layer;
                var layerIds = projectLayerMap[layerId];
                if (!layerIds) return;

                var visibility = cb.checked ? 'visible' : 'none';
                layerIds.forEach(function(id) {
                    if (map.getLayer(id)) {
                        map.setLayoutProperty(id, 'visibility', visibility);
                    }
                });
            });
        }

        function addMapLayers() {
            if (!portfolioData) return;

            // Prevent duplicate source errors if called multiple times
            if (map.getSource('buildings')) {
                return;
            }

            map.addSource('buildings', {
                type: 'geojson',
                data: portfolioData
            });

            // Add parcels source and layers
            if (parcelData && parcelData.features) {
                map.addSource('parcels', {
                    type: 'geojson',
                    data: parcelData
                });

                // Parcel fill layer
                map.addLayer({
                    id: 'parcels-fill',
                    type: 'fill',
                    source: 'parcels',
                    paint: {
                        'fill-color': '#5c6bc0',
                        'fill-opacity': 0
                    }
                });

                // Parcel outline layer
                map.addLayer({
                    id: 'parcels-outline',
                    type: 'line',
                    source: 'parcels',
                    paint: {
                        'line-color': '#5c6bc0',
                        'line-width': 2,
                        'line-opacity': 0.8
                    }
                });

                // Parcel hover highlight layer
                map.addLayer({
                    id: 'parcels-highlight',
                    type: 'fill',
                    source: 'parcels',
                    filter: ['==', ['get', 'parcelId'], ''],
                    paint: {
                        'fill-color': '#5c6bc0',
                        'fill-opacity': 0.2
                    }
                });
            }

            // Add green areas source and layers
            if (greenAreaData && greenAreaData.features) {
                map.addSource('lawns', {
                    type: 'geojson',
                    data: greenAreaData
                });

                map.addLayer({
                    id: 'lawns-fill',
                    type: 'fill',
                    source: 'lawns',
                    paint: {
                        'fill-color': '#66bb6a',
                        'fill-opacity': 0.2
                    }
                });

                map.addLayer({
                    id: 'lawns-outline',
                    type: 'line',
                    source: 'lawns',
                    paint: {
                        'line-color': '#43a047',
                        'line-width': 1.5,
                        'line-opacity': 0.6
                    }
                });
            }

            // Add surfaces source and layers
            if (surfaceData && surfaceData.features) {
                map.addSource('surfaces', {
                    type: 'geojson',
                    data: surfaceData
                });

                map.addLayer({
                    id: 'surfaces-fill',
                    type: 'fill',
                    source: 'surfaces',
                    paint: {
                        'fill-color': '#bdbdbd',
                        'fill-opacity': 0.2
                    }
                });

                map.addLayer({
                    id: 'surfaces-outline',
                    type: 'line',
                    source: 'surfaces',
                    paint: {
                        'line-color': '#9e9e9e',
                        'line-width': 1.5,
                        'line-opacity': 0.6
                    }
                });
            }

            // Add gardens source and layers
            if (gardenData && gardenData.features) {
                map.addSource('gardens', {
                    type: 'geojson',
                    data: gardenData
                });

                map.addLayer({
                    id: 'gardens-fill',
                    type: 'fill',
                    source: 'gardens',
                    paint: {
                        'fill-color': '#81c784',
                        'fill-opacity': 0.25
                    }
                });

                map.addLayer({
                    id: 'gardens-outline',
                    type: 'line',
                    source: 'gardens',
                    paint: {
                        'line-color': '#66bb6a',
                        'line-width': 1.5,
                        'line-opacity': 0.6
                    }
                });
            }

            // Add trees source and layers
            if (treeData && treeData.features) {
                map.addSource('trees', {
                    type: 'geojson',
                    data: treeData
                });

                map.addLayer({
                    id: 'trees-points',
                    type: 'circle',
                    source: 'trees',
                    paint: {
                        'circle-radius': 7,
                        'circle-color': '#2e7d32',
                        'circle-stroke-width': 1.5,
                        'circle-stroke-color': '#ffffff'
                    }
                });
            }

            // Add furniture source and layers
            if (furnitureData && furnitureData.features) {
                map.addSource('furniture', {
                    type: 'geojson',
                    data: furnitureData
                });

                map.addLayer({
                    id: 'furniture-points',
                    type: 'circle',
                    source: 'furniture',
                    paint: {
                        'circle-radius': 6,
                        'circle-color': '#8d6e63',
                        'circle-stroke-width': 1.5,
                        'circle-stroke-color': '#ffffff'
                    }
                });
            }

            // Building footprint fill layer
            map.addLayer({
                id: 'buildings-fill',
                type: 'fill',
                source: 'buildings',
                paint: {
                    'fill-color': '#90a4ae',
                    'fill-opacity': 0.35
                }
            });

            // Building footprint outline layer
            map.addLayer({
                id: 'buildings-outline',
                type: 'line',
                source: 'buildings',
                paint: {
                    'line-color': '#78909c',
                    'line-width': 2,
                    'line-opacity': 0.9
                }
            });

            // Selected building highlight layer
            map.addLayer({
                id: 'buildings-selected',
                type: 'line',
                source: 'buildings',
                filter: ['==', ['get', 'buildingId'], ''],
                paint: {
                    'line-color': '#c00',
                    'line-width': 3,
                    'line-opacity': 0.9
                }
            });

            // Selected building pulse animation layer
            map.addLayer({
                id: 'buildings-selected-pulse',
                type: 'line',
                source: 'buildings',
                filter: ['==', ['get', 'buildingId'], ''],
                paint: {
                    'line-color': '#c00',
                    'line-width': 2,
                    'line-opacity': 0.4
                }
            });

            // Animate the pulse layer
            var pulseWidth = 2;
            var pulseOpacity = 0.4;
            var pulseDirection = 1;
            var pulseAnimationId = null;

            function animatePulse() {
                // Only animate if a building is selected
                if (!selectedBuildingId) {
                    pulseAnimationId = null;
                    return;
                }

                pulseWidth += 0.1 * pulseDirection;
                pulseOpacity -= 0.01 * pulseDirection;

                if (pulseWidth >= 5) {
                    pulseDirection = -1;
                } else if (pulseWidth <= 2) {
                    pulseDirection = 1;
                }

                if (map.getLayer('buildings-selected-pulse')) {
                    map.setPaintProperty('buildings-selected-pulse', 'line-width', pulseWidth);
                    map.setPaintProperty('buildings-selected-pulse', 'line-opacity', Math.max(0.1, pulseOpacity));
                }

                pulseAnimationId = requestAnimationFrame(animatePulse);
            }

            // Start/stop pulse animation based on selection (exposed globally)
            window.startPulseAnimation = function() {
                if (pulseAnimationId === null) {
                    pulseWidth = 2;
                    pulseOpacity = 0.4;
                    pulseDirection = 1;
                    animatePulse();
                }
            };

            window.stopPulseAnimation = function() {
                if (pulseAnimationId !== null) {
                    cancelAnimationFrame(pulseAnimationId);
                    pulseAnimationId = null;
                }
            };
            
            map.on('mouseenter', 'buildings-fill', function() {
                map.getCanvas().style.cursor = 'pointer';
            });
            
            map.on('mouseleave', 'buildings-fill', function() {
                map.getCanvas().style.cursor = '';
            });
            
            // CLICK HANDLER
            map.on('click', 'buildings-fill', function(e) {
                var props = e.features[0].properties;
                selectBuilding(props.buildingId, false);
                showFeaturePopup(e.lngLat, 'Gebäude', [
                    ['ID', props.buildingId],
                    ['Name', props.name],
                    ['Typ', props.primaryTypeOfBuilding],
                    ['Adresse', (props.streetName || '') + ' ' + (props.houseNumber || '')],
                    ['Ort', (props.postalCode || '') + ' ' + (props.city || '')],
                    ['Baujahr', props.constructionYear],
                    ['Status', props.status]
                ]);
            });

            // PARCEL HANDLERS
            if (parcelData && parcelData.features) {
                map.on('mouseenter', 'parcels-fill', function(e) {
                    map.getCanvas().style.cursor = 'pointer';
                    if (e.features.length > 0) {
                        var parcelId = e.features[0].properties.parcelId;
                        map.setFilter('parcels-highlight', ['==', ['get', 'parcelId'], parcelId]);
                    }
                });

                map.on('mouseleave', 'parcels-fill', function() {
                    map.getCanvas().style.cursor = '';
                    map.setFilter('parcels-highlight', ['==', ['get', 'parcelId'], '']);
                });

                map.on('click', 'parcels-fill', function(e) {
                    // Check if a building footprint is under the click - buildings take priority
                    var buildingFeatures = map.queryRenderedFeatures(e.point, { layers: ['buildings-fill'] });
                    if (buildingFeatures.length > 0) {
                        return; // Let the building click handler handle it
                    }
                    var props = e.features[0].properties;
                    selectParcel(props.parcelId);
                    showFeaturePopup(e.lngLat, 'Parzelle', [
                        ['ID', props.parcelId],
                        ['Name', props.name],
                        ['Nr.', props.plotNumber],
                        ['Gemeinde', props.municipality],
                        ['Fläche', props.area, ' m²'],
                        ['Nutzungszone', props.landUseZone],
                        ['Eigentum', props.ownershipType]
                    ]);
                });
            }

            // Click on map (not on a point or parcel) to deselect or identify Swisstopo features
            map.on('click', function(e) {
                var pointFeatures = map.queryRenderedFeatures(e.point, { layers: ['buildings-fill'] });
                var parcelFeatures = parcelData && parcelData.features ? map.queryRenderedFeatures(e.point, { layers: ['parcels-fill'] }) : [];
                var surfaceFeatures = surfaceData && surfaceData.features && map.getLayer('surfaces-fill') ? map.queryRenderedFeatures(e.point, { layers: ['surfaces-fill'] }) : [];
                var gardenFeatures = gardenData && gardenData.features && map.getLayer('gardens-fill') ? map.queryRenderedFeatures(e.point, { layers: ['gardens-fill'] }) : [];
                if (pointFeatures.length === 0 && parcelFeatures.length === 0 && surfaceFeatures.length === 0 && gardenFeatures.length === 0) {
                    selectedBuildingId = null;
                    selectedParcelId = null;
                    updateSelectedBuilding();
                    updateSelectedParcel();
                    updateUrlWithSelection();

                    // Close any open feature popup
                    if (featurePopup) featurePopup.remove();

                    // Try to identify features from active Swisstopo layers
                    if (activeSwisstopoLayers.length > 0) {
                        identifySwisstopoFeatures(e.lngLat);
                    }
                } else {
                    // Clear any Swisstopo highlight when selecting a portfolio feature
                    clearIdentifyHighlight();
                }
            });

            // Apply initial filters to map if any
            if (filteredData && getActiveFilterCount() > 0) {
                updateMapFilter();
            }

            // Select building or parcel from URL parameter if present
            var urlBuildingId = urlParams.get('id');
            var urlParcelId = urlParams.get('parcelId');
            if (urlBuildingId) {
                var building = portfolioData.features.find(function(f) {
                    return f.properties.buildingId === urlBuildingId;
                });
                if (building) {
                    selectBuilding(urlBuildingId, true);
                }
            } else if (urlParcelId && parcelData && parcelData.features) {
                var parcel = parcelData.features.find(function(f) {
                    return f.properties.parcelId === urlParcelId;
                });
                if (parcel) {
                    selectParcel(urlParcelId, true);
                }
            }

            // Initialize highlight layer for Swisstopo feature identification
            initIdentifyHighlightLayer();

            // Load background layers from URL parameters
            loadLayersFromUrl();

            // Add click handlers for green features (trees, furniture, green areas)
            addGreenFeatureClickHandlers();
        }

        // Reusable function to select a building
        // flyToBuilding: if true, map will fly to the building location
        function selectBuilding(buildingId, flyToBuilding) {
            // ES5 default parameter
            if (flyToBuilding === undefined) flyToBuilding = false;

            // Find feature props
            var building = portfolioData.features.find(function(f) { return f.properties.buildingId === buildingId; });
            if (!building) return;

            // Update selected IDs (clear parcel selection)
            selectedBuildingId = buildingId;
            selectedParcelId = null;
            updateSelectedBuilding();
            updateSelectedParcel();
            updateUrlWithSelection();

            // UPDATED: Only fly to building if explicitly requested (e.g. from Search)
            if (map && flyToBuilding) {
                map.flyTo({
                    center: getPolygonCentroid(building.geometry.coordinates),
                    zoom: 16
                });
            }
        }
        
        function updateSelectedBuilding() {
            if (map && map.getLayer('buildings-selected')) {
                map.setFilter('buildings-selected', ['==', ['get', 'buildingId'], selectedBuildingId || '']);
            }
            if (map && map.getLayer('buildings-selected-pulse')) {
                map.setFilter('buildings-selected-pulse', ['==', ['get', 'buildingId'], selectedBuildingId || '']);
            }
            // Start or stop pulse animation based on selection
            if (selectedBuildingId && typeof window.startPulseAnimation === 'function') {
                window.startPulseAnimation();
            } else if (typeof window.stopPulseAnimation === 'function') {
                window.stopPulseAnimation();
            }
        }

        function updateUrlWithSelection() {
            var url = new URL(window.location);
            if (selectedBuildingId) {
                url.searchParams.set('id', selectedBuildingId);
            } else {
                url.searchParams.delete('id');
            }
            if (selectedParcelId) {
                url.searchParams.set('parcelId', selectedParcelId);
            } else {
                url.searchParams.delete('parcelId');
            }
            window.history.replaceState({}, '', url);
        }

        function updateUrlWithLayers() {
            var url = new URL(window.location);
            if (activeSwisstopoLayers.length > 0) {
                var layerIds = activeSwisstopoLayers.map(function(l) { return l.id; });
                url.searchParams.set('bgLayers', layerIds.join(','));
            } else {
                url.searchParams.delete('bgLayers');
            }
            window.history.replaceState({}, '', url);
        }

        function loadLayersFromUrl() {
            var urlParams = new URLSearchParams(window.location.search);
            var bgLayers = urlParams.get('bgLayers');
            if (bgLayers) {
                var layerIds = bgLayers.split(',');
                // Limit to max 10 layers from URL to prevent abuse
                var maxLayers = Math.min(layerIds.length, 10);
                for (var i = 0; i < maxLayers; i++) {
                    var layerId = layerIds[i].trim();
                    if (layerId) {
                        // Pass silent=true to suppress toasts when loading from URL
                        // Layer ID validation happens inside addSwisstopoLayer
                        addSwisstopoLayer(layerId, layerId, true);
                    }
                }
            }
        }

        // ===== PARCEL SELECTION FUNCTIONALITY =====

        // Helper function to calculate polygon centroid
        function getPolygonCentroid(coordinates) {
            var ring = coordinates[0]; // outer ring
            var x = 0, y = 0, n = ring.length - 1; // exclude closing point
            for (var i = 0; i < n; i++) {
                x += ring[i][0];
                y += ring[i][1];
            }
            return [x / n, y / n];
        }

        function selectParcel(parcelId, flyToParcel) {
            // ES5 default parameter
            if (flyToParcel === undefined) flyToParcel = false;

            // Find parcel feature
            var parcel = parcelData.features.find(function(f) { return f.properties.parcelId === parcelId; });
            if (!parcel) return;

            // Update selected IDs (clear building selection)
            selectedParcelId = parcelId;
            selectedBuildingId = null;
            updateSelectedBuilding();
            updateSelectedParcel();
            updateUrlWithSelection();

            // Fly to parcel if requested
            if (map && flyToParcel && parcel.geometry && parcel.geometry.coordinates) {
                var center = getPolygonCentroid(parcel.geometry.coordinates);
                map.flyTo({
                    center: center,
                    zoom: 16
                });
            }
        }

        function updateSelectedParcel() {
            if (map && map.getLayer('parcels-highlight')) {
                map.setFilter('parcels-highlight', ['==', ['get', 'parcelId'], selectedParcelId || '']);
            }
        }

        // ===== SEARCH FUNCTIONALITY =====
        var searchInput = document.getElementById('search-input');
        var searchResults = document.getElementById('search-results');
        var searchSpinner = document.getElementById('search-spinner');
        var searchClearBtn = document.getElementById('search-clear-btn');
        var searchDebounceTimer;
        var searchAbortController = null;
        
        // Listen for input
        searchInput.addEventListener('input', function(e) {
            clearTimeout(searchDebounceTimer);
            var val = e.target.value.trim();
            
            // Toggle clear button visibility
            if (val.length > 0) {
                searchClearBtn.classList.add('visible');
            } else {
                searchClearBtn.classList.remove('visible');
            }
            
            if (val.length < 2) {
                searchResults.classList.remove('active');
                searchSpinner.style.display = 'none';
                return;
            }
            
            searchSpinner.style.display = 'block';
            searchDebounceTimer = setTimeout(function() {
                performSearch(val);
            }, 300);
        });

        // Clear Button Click Listener
        searchClearBtn.addEventListener('click', function() {
            searchInput.value = '';
            searchClearBtn.classList.remove('visible');
            searchResults.classList.remove('active');
            searchInput.focus();
            
            // Remove the search marker if it exists
            if (searchMarker) {
                searchMarker.remove();
                searchMarker = null;
            }
        });
        
        // Close search on click outside
        document.addEventListener('click', function(e) {
            if (!document.getElementById('search-wrapper').contains(e.target)) {
                searchResults.classList.remove('active');
            }
        });

        // Close search on Escape
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                searchResults.classList.remove('active');
            }
        });
        
        function performSearch(term) {
            // Cancel any pending search requests
            if (searchAbortController) {
                searchAbortController.abort();
            }
            searchAbortController = new AbortController();
            var signal = searchAbortController.signal;

            var promises = [];

            // 1. Local Search
            promises.push(new Promise(function(resolve) {
                var matches = [];
                if (portfolioData) {
                    var lowerTerm = term.toLowerCase();
                    matches = portfolioData.features.filter(function(f) {
                        var p = f.properties;
                        return (p.name && p.name.toLowerCase().includes(lowerTerm)) ||
                               (p.streetName && p.streetName.toLowerCase().includes(lowerTerm)) ||
                               (p.city && p.city.toLowerCase().includes(lowerTerm));
                    });
                }
                resolve({ type: 'local', data: matches });
            }));

            // 2. Swisstopo Locations
            promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=locations&limit=5&sr=4326&searchText=' + encodeURIComponent(term), { signal: signal })
                .then(function(r) { return r.json(); })
                .then(function(data) { return { type: 'locations', data: data.results }; })
                .catch(function(e) {
                    if (e.name === 'AbortError') return { type: 'locations', data: [], aborted: true };
                    return { type: 'locations', data: [] };
                }));

            // 3. Swisstopo Layers
            promises.push(fetch('https://api3.geo.admin.ch/rest/services/ech/SearchServer?type=layers&limit=5&lang=de&searchText=' + encodeURIComponent(term), { signal: signal })
                .then(function(r) { return r.json(); })
                .then(function(data) { return { type: 'layers', data: data.results }; })
                .catch(function(e) {
                    if (e.name === 'AbortError') return { type: 'layers', data: [], aborted: true };
                    return { type: 'layers', data: [] };
                }));

            Promise.all(promises).then(function(results) {
                // Don't render if request was aborted (newer search in progress)
                var wasAborted = results.some(function(r) { return r.aborted; });
                if (wasAborted) return;

                renderSearchResults(results);
                searchSpinner.style.display = 'none';
            });
        }
        
        function renderSearchResults(results) {
            var localResults = results.find(function(r) { return r.type === 'local'; }).data;
            var locResults = results.find(function(r) { return r.type === 'locations'; }).data;
            var layerResults = results.find(function(r) { return r.type === 'layers'; }).data;
            
            var html = '';
            
            // Section: Objekte (Local)
            if (localResults.length > 0) {
                html += '<div class="search-section-header">Objekte</div>';
                localResults.forEach(function(f) {
                    html += '<div class="search-item" onclick="handleSearchClick(\'local\', \'' + f.properties.buildingId + '\')">' +
                            '<div class="search-item-title">' + f.properties.name + '</div>' +
                            '<div class="search-item-subtitle">' + f.properties.streetName + ', ' + f.properties.city + '</div>' +
                            '</div>';
                });
            }
            
            // Section: Orte (API)
            if (locResults.length > 0) {
                html += '<div class="search-section-header">Orte</div>';
                locResults.forEach(function(r, index) {
                    var lat = r.attrs.lat;
                    var lon = r.attrs.lon;
                    var zoom = r.attrs.zoomlevel || 14;
                    html += '<div class="search-item" onclick="handleSearchClick(\'location\', null, ' + lat + ', ' + lon + ', ' + zoom + ')">' +
                            '<div class="search-item-title">' + r.attrs.label + '</div>' +
                            '</div>';
                });
            }
            
            // Section: Karten (API)
            if (layerResults.length > 0) {
                html += '<div class="search-section-header">Karten hinzufügen...</div>';
                layerResults.forEach(function(r) {
                    var layerId = r.attrs.layer || '';
                    var layerTitle = r.attrs.title || r.attrs.label || layerId;
                    html += '<div class="search-item" onclick="handleSearchClick(\'layer\', \'' + layerId.replace(/'/g, "\\'") + '\', null, null, null, \'' + layerTitle.replace(/'/g, "\\'") + '\')">' +
                            '<div class="search-item-title">' + r.attrs.label + '</div>' +
                            '</div>';
                });
            }
            
            if (html === '') {
                html = '<div class="search-item" style="cursor:default;"><div class="search-item-subtitle">Keine Resultate gefunden</div></div>';
            }
            
            searchResults.innerHTML = html;
            searchResults.classList.add('active');
        }
        
        // Make this function global so onclick in HTML string works
        window.handleSearchClick = function(type, id, lat, lon, zoom, title) {
            searchResults.classList.remove('active');
            
            if (currentView !== 'map') {
                switchView('map');
            }
            
            if (type === 'local') {
                // Pass true to fly to the building when searching
                selectBuilding(id, true);
                
                // Remove generic search marker if we select a specific building
                if (searchMarker) {
                    searchMarker.remove();
                    searchMarker = null;
                }

                var b = portfolioData.features.find(f => f.properties.buildingId === id);
                if(b) {
                    searchInput.value = b.properties.name;
                    searchClearBtn.classList.add('visible');
                }

            } else if (type === 'location') {
                // 1. Remove existing marker
                if (searchMarker) {
                    searchMarker.remove();
                }

                // 2. Fly to location
                map.flyTo({
                    center: [lon, lat],
                    zoom: zoom
                });

                // 3. Add Red Marker
                searchMarker = new mapboxgl.Marker({ color: '#c00' })
                    .setLngLat([lon, lat])
                    .addTo(map);

                // Clear selected building
                selectedBuildingId = null;
                updateSelectedBuilding();
                updateUrlWithSelection();
                if (featurePopup) featurePopup.remove();

                searchClearBtn.classList.add('visible');

            } else if (type === 'layer') {
                addSwisstopoLayer(id, title);
            }
        };
        
        // ===== ACCORDION =====
        var geokatalogAccordion = document.getElementById('geokatalog-accordion');

        document.querySelectorAll('.accordion-header').forEach(function(header) {
            header.addEventListener('click', function() {
                var content = this.nextElementSibling;
                var isActive = this.classList.contains('active');
                var isGeokatalog = this.parentElement.id === 'geokatalog-accordion';

                document.querySelectorAll('.accordion-header').forEach(function(h) { h.classList.remove('active'); });
                document.querySelectorAll('.accordion-content').forEach(function(c) { c.classList.remove('show'); });
                geokatalogAccordion.classList.remove('expanded');

                // Hide print preview when any accordion closes
                hidePrintPreview();

                if (!isActive) {
                    this.classList.add('active');
                    content.classList.add('show');

                    // Update share link when Teilen accordion is opened
                    var headerSpans = this.querySelectorAll(':scope > span');
                    var lastSpan = headerSpans[headerSpans.length - 1];
                    if (lastSpan && lastSpan.textContent.trim() === 'Teilen') {
                        updateShareLink();
                    }

                    // Show print preview when Drucken accordion is opened
                    if (lastSpan && lastSpan.textContent.trim() === 'Drucken') {
                        showPrintPreview();
                    }

                    // Update export count when Export accordion is opened
                    if (lastSpan && lastSpan.textContent.trim() === 'Export') {
                        updateExportCount();
                    }

                    // Expand Geokatalog to full height
                    if (isGeokatalog) {
                        geokatalogAccordion.classList.add('expanded');
                        loadGeokatalog();
                    }
                }

                updateMenuTogglePositionDebounced();
            });
        });

        // Print orientation change - update preview
        var printOrientationSelect = document.getElementById('print-orientation');
        if (printOrientationSelect) {
            printOrientationSelect.addEventListener('change', updatePrintPreview);
        }

        // Update print preview on window resize
        window.addEventListener('resize', function() {
            if (printPreviewOverlay && printPreviewOverlay.classList.contains('active')) {
                updatePrintPreview();
            }
        });

        // ===== LAYER INFO MODAL =====
        var layerInfoModal = document.getElementById('layer-info-modal');
        var layerInfoContent = document.getElementById('layer-info-content');
        var layerInfoCloseBtn = layerInfoModal ? layerInfoModal.querySelector('.layer-info-modal-close') : null;

        // Map layer IDs to their GeoJSON file paths (for reading layerInfo metadata)
        var layerGeoJsonFiles = {
            'trees': 'data/trees.geojson',
            'furniture': 'data/furniture.geojson',
            'structure-elements': 'data/structure-elements.geojson',
            'linear-features': 'data/linear-features.geojson',
            'water-features': 'data/water-features.geojson',
            'surfaces': 'data/surfaces.geojson',
            'plantings': 'data/plantings.geojson',
            'building-greenery': 'data/building-greenery.geojson',
            'lawns': 'data/lawns.geojson',
            'gardens': 'data/gardens.geojson',
            'external-areas': 'data/external-areas.geojson',
            'woodlands': 'data/woodlands.geojson',
            'forest': 'data/forest.geojson',
            'buildings': 'data/buildings.geojson',
            'parcels': 'data/parcels.geojson'
        };

        // Cache for fetched layerInfo to avoid repeated requests
        var layerInfoCache = {};

        function renderLayerInfoHtml(info, featureCount) {
            return '<div class="layer-info-internal">' +
                '<div class="layer-info-internal-header">' +
                    '<h3>' + escapeHtml(info.name) + '</h3>' +
                '</div>' +
                '<p class="layer-info-internal-desc">' + escapeHtml(info.description) + '</p>' +
                '<div class="layer-info-internal-meta">' +
                    '<div class="layer-info-meta-item">' +
                        '<span class="layer-info-meta-label">Objekte</span>' +
                        '<span class="layer-info-meta-value">' + featureCount + '</span>' +
                    '</div>' +
                    '<div class="layer-info-meta-item">' +
                        '<span class="layer-info-meta-label">Geometrie</span>' +
                        '<span class="layer-info-meta-value">' + escapeHtml(info.geometryType || '—') + '</span>' +
                    '</div>' +
                    '<div class="layer-info-meta-item">' +
                        '<span class="layer-info-meta-label">Quelle</span>' +
                        '<span class="layer-info-meta-value">' + escapeHtml(info.source || '—') + '</span>' +
                    '</div>' +
                '</div>' +
            '</div>';
        }

        function showLayerInfo(layerId) {
            if (!layerInfoModal || !layerInfoContent || !layerId) return;

            // Show modal with loading state
            layerInfoContent.innerHTML = '<div class="layer-info-loading">Lade Informationen...</div>';
            layerInfoModal.classList.add('show');

            // Check if this is an internal layer with a GeoJSON file
            var geoJsonFile = layerGeoJsonFiles[layerId];
            if (geoJsonFile) {
                // Use cache if available
                if (layerInfoCache[layerId]) {
                    var cached = layerInfoCache[layerId];
                    layerInfoContent.innerHTML = renderLayerInfoHtml(cached.info, cached.count);
                    return;
                }

                // Fetch layerInfo from GeoJSON file
                fetch(geoJsonFile)
                    .then(function(response) {
                        if (!response.ok) throw new Error('GeoJSON nicht verfügbar');
                        return response.json();
                    })
                    .then(function(data) {
                        var info = data && data.layerInfo;
                        if (info) {
                            var count = data.features ? data.features.length : 0;
                            layerInfoCache[layerId] = { info: info, count: count };
                            layerInfoContent.innerHTML = renderLayerInfoHtml(info, count);
                        } else {
                            layerInfoContent.innerHTML = '<div class="layer-info-loading">Keine Informationen verfügbar.</div>';
                        }
                    })
                    .catch(function(error) {
                        console.error('Fehler beim Laden der Layer-Informationen:', error);
                        layerInfoContent.innerHTML = '<div class="layer-info-loading">Informationen konnten nicht geladen werden.</div>';
                    });
                return;
            }

            // External layer — fetch from swisstopo API
            fetch('https://api3.geo.admin.ch/rest/services/api/MapServer/' + layerId + '/legend?lang=de')
                .then(function(response) {
                    if (!response.ok) throw new Error('Layer-Informationen nicht verfügbar');
                    return response.text();
                })
                .then(function(html) {
                    layerInfoContent.innerHTML = html;
                })
                .catch(function(error) {
                    console.error('Fehler beim Laden der Layer-Informationen:', error);
                    layerInfoContent.innerHTML = '<div class="layer-info-loading">Informationen konnten nicht geladen werden.</div>';
                });
        }

        function hideLayerInfo() {
            if (layerInfoModal) {
                layerInfoModal.classList.remove('show');
            }
        }

        // Close modal on button click
        if (layerInfoCloseBtn) {
            layerInfoCloseBtn.addEventListener('click', hideLayerInfo);
        }

        // Close modal on backdrop click
        if (layerInfoModal) {
            layerInfoModal.addEventListener('click', function(e) {
                if (e.target === layerInfoModal) {
                    hideLayerInfo();
                }
            });
        }

        // Close modals on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape' && layerInfoModal && layerInfoModal.classList.contains('show')) {
                hideLayerInfo();
            }
        });

        // Make showLayerInfo globally accessible for onclick handlers
        window.showLayerInfo = showLayerInfo;

        // ===== API DOCS LINK =====
        var apiLink = document.getElementById('footer-api-link');
        if (apiLink) {
            apiLink.addEventListener('click', function(e) {
                e.preventDefault();
                switchView('api');
            });
        }

        // ===== GEOKATALOG =====
        var geokatalogLoaded = false;

        // Sync Geokatalog checkboxes with active layers
        function updateGeokatalogCheckboxes() {
            var checkboxes = document.querySelectorAll('.node-checkbox[data-layer-id]');
            checkboxes.forEach(function(checkbox) {
                var layerId = checkbox.getAttribute('data-layer-id');
                var isActive = activeSwisstopoLayers.some(function(l) { return l.id === layerId; });
                checkbox.checked = isActive;
            });
        }

        // Sync layer widget checkboxes — no longer needed (widget removed)
        function updateLayerWidgetCheckboxes() {
            // No-op: layer widget has been replaced by Dargestellte Karten accordion
        }

        function loadGeokatalog() {
            if (geokatalogLoaded) return;

            var treeContainer = document.getElementById('geokatalog-tree');

            fetch('https://api3.geo.admin.ch/rest/services/ech/CatalogServer?lang=de')
                .then(function(response) {
                    if (!response.ok) throw new Error('API nicht erreichbar');
                    return response.json();
                })
                .then(function(data) {
                    geokatalogLoaded = true;
                    treeContainer.innerHTML = '';

                    if (data.results && data.results.root && data.results.root.children) {
                        renderCatalogTree(data.results.root.children, treeContainer);
                    } else {
                        treeContainer.innerHTML = '<div class="geokatalog-error">Keine Daten verfügbar</div>';
                    }

                    updateMenuTogglePositionDebounced();
                })
                .catch(function(error) {
                    console.error('Geokatalog Fehler:', error);
                    treeContainer.innerHTML = '<div class="geokatalog-error">Fehler beim Laden des Katalogs</div>';
                });
        }

        function renderCatalogTree(items, container) {
            items.forEach(function(item) {
                var itemEl = document.createElement('div');
                itemEl.className = 'catalog-item';

                var hasChildren = item.children && item.children.length > 0;

                var nodeEl = document.createElement('div');
                nodeEl.className = 'catalog-node' + (hasChildren ? '' : ' leaf');

                if (hasChildren) {
                    // Category node with arrow
                    var arrowEl = document.createElement('span');
                    arrowEl.className = 'node-arrow';
                    arrowEl.innerHTML = '<span class="material-symbols-outlined">chevron_right</span>';
                    nodeEl.appendChild(arrowEl);
                } else {
                    // Leaf node with checkbox (native input for reliable checked state)
                    var checkboxEl = document.createElement('input');
                    checkboxEl.type = 'checkbox';
                    checkboxEl.className = 'node-checkbox';
                    // Store layer ID for later reference
                    if (item.layerBodId) {
                        checkboxEl.setAttribute('data-layer-id', item.layerBodId);
                        // Check if layer is already active
                        var isActive = activeSwisstopoLayers.some(function(l) { return l.id === item.layerBodId; });
                        if (isActive) {
                            checkboxEl.checked = true;
                        }
                    }
                    nodeEl.appendChild(checkboxEl);
                }

                var labelEl = document.createElement('span');
                labelEl.className = 'node-label';
                labelEl.textContent = item.label || item.category || 'Unbekannt';
                nodeEl.appendChild(labelEl);

                // Add info icon to leaf nodes
                if (!hasChildren && item.layerBodId) {
                    var infoEl = document.createElement('span');
                    infoEl.className = 'node-info';
                    infoEl.innerHTML = '<span class="material-symbols-outlined">info</span>';
                    infoEl.setAttribute('data-layer-id', item.layerBodId);
                    nodeEl.appendChild(infoEl);

                    // Click on info icon shows layer info modal
                    infoEl.addEventListener('click', function(e) {
                        e.stopPropagation();
                        var lid = this.getAttribute('data-layer-id');
                        if (lid) showLayerInfo(lid);
                    });
                }

                itemEl.appendChild(nodeEl);

                if (hasChildren) {
                    var childrenEl = document.createElement('div');
                    childrenEl.className = 'catalog-children';
                    renderCatalogTree(item.children, childrenEl);
                    itemEl.appendChild(childrenEl);

                    nodeEl.addEventListener('click', function(e) {
                        e.stopPropagation();
                        itemEl.classList.toggle('expanded');
                        nodeEl.classList.toggle('expanded');
                        updateMenuTogglePositionDebounced();
                    });
                } else {
                    // Click on leaf node toggles layer
                    var layerId = item.layerBodId;
                    var layerTitle = item.label || item.category || layerId;

                    nodeEl.addEventListener('click', function(e) {
                        e.stopPropagation();
                        // Don't toggle if clicking on info icon
                        if (e.target.closest('.node-info')) return;
                        if (!layerId) return;

                        var checkboxEl = nodeEl.querySelector('.node-checkbox');
                        var isActive = activeSwisstopoLayers.some(function(l) { return l.id === layerId; });

                        if (isActive) {
                            removeSwisstopoLayer(layerId);
                            if (checkboxEl) checkboxEl.checked = false;
                        } else {
                            addSwisstopoLayer(layerId, layerTitle, false);
                            if (checkboxEl) checkboxEl.checked = true;
                        }
                    });
                }

                container.appendChild(itemEl);
            });
        }

        // ===== MENU TOGGLE =====
        var menuToggle = document.getElementById('menu-toggle');
        var accordionPanel = document.getElementById('accordion-panel');
        var menuToggleText = document.getElementById('menu-toggle-text');
        var menuToggleIcon = menuToggle.querySelector('.material-symbols-outlined');
        var menuOpen = true;
        
        function updateMenuTogglePosition() {
            var mainRect = document.getElementById('map-view').getBoundingClientRect();

            if (menuOpen) {
                var panelRect = accordionPanel.getBoundingClientRect();
                var calculatedTop = panelRect.bottom - mainRect.top;
                // Ensure button stays below the panel - if panel hasn't rendered yet, retry
                if (panelRect.height < 50) {
                    setTimeout(updateMenuTogglePosition, 50);
                    return;
                }
                menuToggle.style.top = calculatedTop + 'px';
            } else {
                menuToggle.style.top = '10px';
            }
        }

        // Debounced version to consolidate rapid calls
        var menuToggleDebounceTimer = null;
        function updateMenuTogglePositionDebounced() {
            if (menuToggleDebounceTimer) {
                clearTimeout(menuToggleDebounceTimer);
            }
            menuToggleDebounceTimer = setTimeout(updateMenuTogglePosition, 10);
        }

        setTimeout(updateMenuTogglePosition, 100);
        
        menuToggle.addEventListener('click', function() {
            menuOpen = !menuOpen;
            
            if (menuOpen) {
                accordionPanel.classList.remove('collapsed');
                menuToggleText.textContent = 'Menü schliessen';
                menuToggleIcon.textContent = 'expand_less';
            } else {
                accordionPanel.classList.add('collapsed');
                menuToggleText.textContent = 'Menü öffnen';
                menuToggleIcon.textContent = 'expand_more';
            }
            
            updateMenuTogglePositionDebounced();
        });

        var observer = new MutationObserver(function() {
            updateMenuTogglePositionDebounced();
        });
        observer.observe(accordionPanel, { attributes: true, childList: true, subtree: true });
        


        // ===== STYLE SWITCHER =====
        // Note: mapStyles and currentMapStyle are defined earlier (before map initialization)
        var styleSwitcherBtn = document.getElementById('style-switcher-btn');
        var stylePanel = document.getElementById('style-panel');
        var stylePanelOpen = false;

        // Generate thumbnail URL using Mapbox Static Images API
        function getStyleThumbnail(styleId, width, height) {
            var lon = 8.2275;
            var lat = 46.8182;
            var zoom = 6;
            return 'https://api.mapbox.com/styles/v1/mapbox/' + styleId + '/static/' +
                   lon + ',' + lat + ',' + zoom + '/' + width + 'x' + height +
                   '?access_token=' + mapboxgl.accessToken;
        }

        // Initialize thumbnails
        function initStyleThumbnails() {
            Object.keys(mapStyles).forEach(function(styleId) {
                var thumbEl = document.getElementById('thumb-' + styleId);
                if (thumbEl) {
                    thumbEl.src = getStyleThumbnail(styleId, 140, 100);
                }
            });
            // Set current style thumbnail
            document.getElementById('current-style-thumb').src = getStyleThumbnail(currentMapStyle, 160, 120);
        }

        // Update active style button
        function updateActiveStyleButton() {
            document.querySelectorAll('.style-option').forEach(function(btn) {
                btn.classList.remove('active');
                if (btn.dataset.style === currentMapStyle) {
                    btn.classList.add('active');
                }
            });
            document.getElementById('current-style-thumb').src = getStyleThumbnail(currentMapStyle, 160, 120);
        }

        // Toggle style panel
        function toggleStylePanel() {
            stylePanelOpen = !stylePanelOpen;
            if (stylePanelOpen) {
                stylePanel.classList.add('show');
            } else {
                stylePanel.classList.remove('show');
            }
        }

        // Close panel when clicking outside
        document.addEventListener('click', function(e) {
            if (stylePanelOpen && !e.target.closest('.style-switcher')) {
                stylePanelOpen = false;
                stylePanel.classList.remove('show');
            }
        });

        // Style switcher button click
        styleSwitcherBtn.addEventListener('click', function(e) {
            e.stopPropagation();
            toggleStylePanel();
        });

        // Style option click handlers
        document.querySelectorAll('.style-option').forEach(function(btn) {
            btn.addEventListener('click', function(e) {
                e.stopPropagation();
                var styleId = this.dataset.style;
                if (styleId === currentMapStyle) {
                    toggleStylePanel();
                    return;
                }

                currentMapStyle = styleId;
                localStorage.setItem('mapStyle', styleId);
                updateActiveStyleButton();

                // Change map style
                map.setStyle(mapStyles[styleId].url);

                // Close panel
                stylePanelOpen = false;
                stylePanel.classList.remove('show');
            });
        });

        // Re-add layers after style change
        map.on('style.load', function() {
            // Only re-add if portfolio data is loaded and source doesn't exist
            if (portfolioData && !map.getSource('buildings')) {
                addMapLayers();
                // Sync layer visibility with checkbox state after re-adding
                syncLayerVisibilityWithCheckboxes();
            }

            // Re-add Swisstopo layers that were active before style change
            readdSwisstopoLayers();
        });

        // Initialize thumbnails after a short delay to ensure token is available
        setTimeout(initStyleThumbnails, 100);
        updateActiveStyleButton();

        // ===== MAP CONTEXT MENU =====

        var contextMenu = document.getElementById('map-context-menu');
        var contextMenuCoords = document.getElementById('context-menu-coords');
        var contextMenuCoordsText = document.getElementById('context-menu-coords-text');
        var contextMenuShare = document.getElementById('context-menu-share');
        var contextMenuMeasure = document.getElementById('context-menu-measure');
        var contextMenuMeasureText = document.getElementById('context-menu-measure-text');
        var contextMenuPrint = document.getElementById('context-menu-print');
        var contextMenuReport = document.getElementById('context-menu-report');
        var measureDistanceDisplay = document.getElementById('measure-distance-display');
        var measureDistanceClose = document.getElementById('measure-distance-close');
        var measureTotalDistance = document.getElementById('measure-total-distance');
        var measureTotalArea = document.getElementById('measure-total-area');
        var measureAreaRow = document.getElementById('measure-area-row');

        // Store the clicked coordinates
        var contextMenuLngLat = null;

        // Measure distance state (Google Maps style - multi-point polyline)
        var measureState = {
            active: false,
            points: [],           // Array of [lng, lat] coordinates
            markers: [],          // Array of Mapbox markers
            labelMarkers: [],     // Array of label markers for distances
            lineSourceId: 'measure-line-source',
            lineLayerId: 'measure-line',
            isClosed: false       // True if polygon is closed
        };

        // Show context menu on right-click
        map.on('contextmenu', function(e) {
            e.preventDefault();

            // Store clicked coordinates
            contextMenuLngLat = e.lngLat;

            // Update coordinates display (lat, lon with 5 decimals)
            var lat = contextMenuLngLat.lat.toFixed(5);
            var lon = contextMenuLngLat.lng.toFixed(5);
            contextMenuCoordsText.textContent = lat + ', ' + lon;
            contextMenuCoords.classList.remove('copied');

            // Toggle measure menu text based on state
            if (measureState.active) {
                contextMenuMeasureText.textContent = 'Messung löschen';
            } else {
                contextMenuMeasureText.textContent = 'Distanz messen';
            }

            // Get map container dimensions
            var mapContainer = document.getElementById('map');
            var mapRect = mapContainer.getBoundingClientRect();

            // Calculate menu position relative to map container
            var menuWidth = 200;
            var menuHeight = 180;
            var clickX = e.point.x;
            var clickY = e.point.y;

            // Edge detection
            var flipHorizontal = (clickX + menuWidth) > mapRect.width;
            var flipVertical = (clickY + menuHeight) > mapRect.height;

            // Position the menu
            contextMenu.style.left = clickX + 'px';
            contextMenu.style.top = clickY + 'px';

            // Apply flip classes
            contextMenu.classList.toggle('flip-horizontal', flipHorizontal);
            contextMenu.classList.toggle('flip-vertical', flipVertical);

            // Show menu
            contextMenu.classList.add('show');
        });

        // Hide context menu
        function hideContextMenu() {
            contextMenu.classList.remove('show');
        }

        // Close menu on Escape key
        document.addEventListener('keydown', function(e) {
            if (e.key === 'Escape') {
                hideContextMenu();
                if (measureState.active) {
                    clearMeasurement();
                }
            }
        });

        // Copy coordinates to clipboard
        contextMenuCoords.addEventListener('click', function() {
            var coordsText = contextMenuCoordsText.textContent;
            navigator.clipboard.writeText(coordsText).then(function() {
                contextMenuCoords.classList.add('copied');
                showToast({
                    type: 'success',
                    title: 'Koordinaten kopiert',
                    message: coordsText,
                    duration: 2000
                });
                setTimeout(hideContextMenu, 300);
            }).catch(function(err) {
                showToast({
                    type: 'error',
                    title: 'Fehler beim Kopieren',
                    message: 'Koordinaten konnten nicht kopiert werden',
                    duration: 3000
                });
            });
        });

        // Share - use native system share
        contextMenuShare.addEventListener('click', function(e) {
            e.stopPropagation();
            if (!contextMenuLngLat) return;

            // Generate share URL with coordinates
            var lat = contextMenuLngLat.lat.toFixed(5);
            var lon = contextMenuLngLat.lng.toFixed(5);
            var shareUrl = window.location.origin + window.location.pathname + '?center=' + lon + ',' + lat + '&zoom=' + Math.round(map.getZoom());

            hideContextMenu();

            // Use native Web Share API
            if (navigator.share) {
                navigator.share({
                    title: 'GIS Immobilienportfolio - Standort',
                    text: 'Schauen Sie sich diesen Standort an:',
                    url: shareUrl
                }).catch(function(err) {
                    // User cancelled or share failed - copy to clipboard as fallback
                    if (err.name !== 'AbortError') {
                        navigator.clipboard.writeText(shareUrl).then(function() {
                            showToast({
                                type: 'success',
                                title: 'Link kopiert',
                                message: 'Link wurde in die Zwischenablage kopiert',
                                duration: 2000
                            });
                        });
                    }
                });
            } else {
                // Fallback for browsers without Web Share API - copy to clipboard
                navigator.clipboard.writeText(shareUrl).then(function() {
                    showToast({
                        type: 'success',
                        title: 'Link kopiert',
                        message: 'Link wurde in die Zwischenablage kopiert',
                        duration: 2000
                    });
                });
            }
        });

        // Print map
        contextMenuPrint.addEventListener('click', function() {
            hideContextMenu();
            window.print();
        });

        // Report problem
        contextMenuReport.addEventListener('click', function() {
            hideContextMenu();
            if (!contextMenuLngLat) return;
            var lat = contextMenuLngLat.lat.toFixed(5);
            var lon = contextMenuLngLat.lng.toFixed(5);
            var subject = encodeURIComponent('Problem melden - GIS Immobilienportfolio');
            var body = encodeURIComponent('Problembeschreibung:\n\n\n\n---\nKoordinaten: ' + lat + ', ' + lon + '\nURL: ' + window.location.href);
            window.location.href = 'mailto:info@gis-immo.ch?subject=' + subject + '&body=' + body;
        });

        // ===== MEASURE DISTANCE FEATURE (Google Maps Style) =====

        // Haversine formula to calculate distance between two points
        function haversineDistance(lat1, lon1, lat2, lon2) {
            var R = 6371000; // Earth's radius in meters
            var dLat = (lat2 - lat1) * Math.PI / 180;
            var dLon = (lon2 - lon1) * Math.PI / 180;
            var a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                    Math.sin(dLon / 2) * Math.sin(dLon / 2);
            var c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
            return R * c;
        }

        // Calculate polygon area using Shoelace formula (in square meters)
        function calculatePolygonArea(points) {
            if (points.length < 3) return 0;

            var n = points.length;
            var area = 0;

            // Convert to approximate meters (at the centroid latitude)
            var avgLat = points.reduce(function(sum, p) { return sum + p[1]; }, 0) / n;
            var latScale = 111320; // meters per degree latitude
            var lonScale = 111320 * Math.cos(avgLat * Math.PI / 180); // meters per degree longitude

            for (var i = 0; i < n; i++) {
                var j = (i + 1) % n;
                var xi = points[i][0] * lonScale;
                var yi = points[i][1] * latScale;
                var xj = points[j][0] * lonScale;
                var yj = points[j][1] * latScale;
                area += xi * yj;
                area -= xj * yi;
            }

            return Math.abs(area / 2);
        }

        // Format distance for display
        function formatDistance(meters) {
            if (meters >= 1000) {
                return (meters / 1000).toFixed(2) + ' km';
            }
            return Math.round(meters) + ' m';
        }

        // Format area for display
        function formatArea(sqMeters) {
            if (sqMeters >= 1000000) {
                return (sqMeters / 1000000).toFixed(2) + ' km²';
            } else if (sqMeters >= 10000) {
                return (sqMeters / 10000).toFixed(2) + ' ha';
            }
            return Math.round(sqMeters) + ' m²';
        }

        // Create a marker element for measurement points
        function createMeasureMarkerElement() {
            var el = document.createElement('div');
            el.className = 'measure-marker';
            return el;
        }

        // Create a label element for distance display on segments
        function createDistanceLabel(distance) {
            var el = document.createElement('div');
            el.className = 'measure-label';
            el.textContent = formatDistance(distance);
            return el;
        }

        // Add a point to the measurement polyline
        function addMeasurePoint(lngLat, index) {
            var point = [lngLat.lng, lngLat.lat];

            if (index === undefined) {
                measureState.points.push(point);
                index = measureState.points.length - 1;
            } else {
                measureState.points[index] = point;
            }

            // Create marker if new point
            if (index >= measureState.markers.length) {
                var markerEl = createMeasureMarkerElement();
                var marker = new mapboxgl.Marker({
                    element: markerEl,
                    draggable: true,
                    anchor: 'center'
                })
                .setLngLat(point)
                .addTo(map);

                // Store index on marker for reference
                marker._measureIndex = index;

                // Drag event to update point position
                marker.on('drag', function() {
                    var newLngLat = marker.getLngLat();
                    measureState.points[marker._measureIndex] = [newLngLat.lng, newLngLat.lat];
                    updateMeasureLine();
                    updateMeasureLabels();
                    updateMeasureDisplay();
                });

                // Click on marker: close polygon if first point, delete otherwise
                markerEl.addEventListener('click', function(e) {
                    e.stopPropagation();
                    var clickedIndex = marker._measureIndex;

                    // If clicking on first point with 3+ points, close polygon
                    if (clickedIndex === 0 && measureState.points.length >= 3 && !measureState.isClosed) {
                        measureState.isClosed = true;
                        updateMeasureLine();
                        updateMeasureLabels();
                        updateMeasureDisplay();
                        return;
                    }

                    // Otherwise delete the point
                    removeMeasurePoint(clickedIndex);
                });

                measureState.markers.push(marker);
            } else {
                measureState.markers[index].setLngLat(point);
            }

            updateMeasureLine();
            updateMeasureLabels();
            updateMeasureDisplay();
        }

        // Remove a point from the measurement polyline
        function removeMeasurePoint(index) {
            if (measureState.points.length <= 1) {
                clearMeasurement();
                return;
            }

            // Remove point
            measureState.points.splice(index, 1);

            // Remove marker
            measureState.markers[index].remove();
            measureState.markers.splice(index, 1);

            // Update marker indices
            measureState.markers.forEach(function(m, i) {
                m._measureIndex = i;
            });

            // Check if polygon was closed and now isn't
            if (measureState.isClosed && measureState.points.length < 3) {
                measureState.isClosed = false;
            }

            updateMeasureLine();
            updateMeasureLabels();
            updateMeasureDisplay();
        }

        // Update the measurement line on the map
        function updateMeasureLine() {
            var coordinates = measureState.points.slice();

            // Close polygon if needed
            if (measureState.isClosed && coordinates.length >= 3) {
                coordinates.push(coordinates[0]);
            }

            // Remove existing layers
            if (map.getLayer(measureState.lineLayerId)) {
                map.removeLayer(measureState.lineLayerId);
            }
            if (map.getSource(measureState.lineSourceId)) {
                map.removeSource(measureState.lineSourceId);
            }

            if (coordinates.length < 2) return;

            // Add source
            map.addSource(measureState.lineSourceId, {
                type: 'geojson',
                data: {
                    type: 'Feature',
                    geometry: {
                        type: 'LineString',
                        coordinates: coordinates
                    }
                }
            });

            // Add line layer
            map.addLayer({
                id: measureState.lineLayerId,
                type: 'line',
                source: measureState.lineSourceId,
                paint: {
                    'line-color': '#000000',
                    'line-width': 2
                }
            });
        }

        // Update distance labels on segments
        function updateMeasureLabels() {
            // Remove existing labels
            measureState.labelMarkers.forEach(function(m) { m.remove(); });
            measureState.labelMarkers = [];

            var points = measureState.points;
            if (points.length < 2) return;

            // Add label for each segment
            for (var i = 0; i < points.length - 1; i++) {
                var p1 = points[i];
                var p2 = points[i + 1];
                var distance = haversineDistance(p1[1], p1[0], p2[1], p2[0]);

                // Midpoint of segment
                var midLng = (p1[0] + p2[0]) / 2;
                var midLat = (p1[1] + p2[1]) / 2;

                var labelEl = createDistanceLabel(distance);
                var labelMarker = new mapboxgl.Marker({
                    element: labelEl,
                    anchor: 'center'
                })
                .setLngLat([midLng, midLat])
                .addTo(map);

                measureState.labelMarkers.push(labelMarker);
            }

            // Add label for closing segment if polygon
            if (measureState.isClosed && points.length >= 3) {
                var pLast = points[points.length - 1];
                var pFirst = points[0];
                var closingDistance = haversineDistance(pLast[1], pLast[0], pFirst[1], pFirst[0]);

                var closingMidLng = (pLast[0] + pFirst[0]) / 2;
                var closingMidLat = (pLast[1] + pFirst[1]) / 2;

                var closingLabelEl = createDistanceLabel(closingDistance);
                var closingLabelMarker = new mapboxgl.Marker({
                    element: closingLabelEl,
                    anchor: 'center'
                })
                .setLngLat([closingMidLng, closingMidLat])
                .addTo(map);

                measureState.labelMarkers.push(closingLabelMarker);
            }
        }

        // Update the measurement display panel
        function updateMeasureDisplay() {
            var points = measureState.points;
            var totalDistance = 0;

            // Calculate total distance
            for (var i = 0; i < points.length - 1; i++) {
                totalDistance += haversineDistance(
                    points[i][1], points[i][0],
                    points[i + 1][1], points[i + 1][0]
                );
            }

            // Add closing distance if polygon
            if (measureState.isClosed && points.length >= 3) {
                totalDistance += haversineDistance(
                    points[points.length - 1][1], points[points.length - 1][0],
                    points[0][1], points[0][0]
                );
            }

            measureTotalDistance.textContent = formatDistance(totalDistance);

            // Calculate and show area if polygon
            if (measureState.isClosed && points.length >= 3) {
                var area = calculatePolygonArea(points);
                measureTotalArea.textContent = formatArea(area);
                measureAreaRow.style.display = 'flex';
            } else {
                measureAreaRow.style.display = 'none';
            }
        }

        // Check if a click is near the first point (to close polygon)
        function isNearFirstPoint(lngLat) {
            if (measureState.points.length < 3) return false;

            var firstPoint = measureState.points[0];
            var distance = haversineDistance(lngLat.lat, lngLat.lng, firstPoint[1], firstPoint[0]);

            // Within 20 meters or visible pixel distance
            var pixelDistance = map.project(lngLat).dist(map.project({ lng: firstPoint[0], lat: firstPoint[1] }));

            return pixelDistance < 15;
        }

        // Start measurement mode
        function startMeasurement() {
            measureState.active = true;
            measureState.points = [];
            measureState.markers = [];
            measureState.labelMarkers = [];
            measureState.isClosed = false;

            measureDistanceDisplay.classList.add('show');
            measureTotalDistance.textContent = '0 m';
            measureAreaRow.style.display = 'none';

            map.getCanvas().style.cursor = 'crosshair';
        }

        // Clear all measurement
        function clearMeasurement() {
            measureState.active = false;
            measureState.isClosed = false;

            // Remove all markers
            measureState.markers.forEach(function(m) { m.remove(); });
            measureState.markers = [];

            // Remove all labels
            measureState.labelMarkers.forEach(function(m) { m.remove(); });
            measureState.labelMarkers = [];

            // Clear points
            measureState.points = [];

            // Remove line layer
            if (map.getLayer(measureState.lineLayerId)) {
                map.removeLayer(measureState.lineLayerId);
            }
            if (map.getSource(measureState.lineSourceId)) {
                map.removeSource(measureState.lineSourceId);
            }

            measureDistanceDisplay.classList.remove('show');
            map.getCanvas().style.cursor = '';
        }

        // Context menu - toggle measurement (start or clear)
        contextMenuMeasure.addEventListener('click', function() {
            hideContextMenu();
            if (measureState.active) {
                clearMeasurement();
            } else {
                startMeasurement();
            }
        });

        // Close button on measurement display
        measureDistanceClose.addEventListener('click', function() {
            clearMeasurement();
        });

        // Map click handler for measurement mode
        map.on('click', function(e) {
            hideContextMenu();

            if (!measureState.active) return;

            // Check if clicking near first point to close polygon
            if (isNearFirstPoint(e.lngLat) && !measureState.isClosed) {
                measureState.isClosed = true;
                updateMeasureLine();
                updateMeasureLabels();
                updateMeasureDisplay();
                return;
            }

            // Don't add points if polygon is already closed
            if (measureState.isClosed) return;

            // Add new point
            addMeasurePoint(e.lngLat);
        });

        // ===== HELPER: Lookup functions =====

        function getContactName(contactId) {
            if (!contactData || !contactId) return '—';
            var c = contactData.find(function(ct) { return ct.contactId === contactId; });
            return c ? c.name : '—';
        }

        function getCareProfileName(careProfileId) {
            if (!careProfileData || !careProfileId) return '—';
            var cp = careProfileData.find(function(p) { return p.careProfileId === careProfileId; });
            return cp ? cp.name : '—';
        }

        function getCareProfile(careProfileId) {
            if (!careProfileData || !careProfileId) return null;
            return careProfileData.find(function(p) { return p.careProfileId === careProfileId; }) || null;
        }

        function formatDateShort(isoStr) {
            if (!isoStr) return '—';
            var d = new Date(isoStr);
            return d.toLocaleDateString('de-CH', { day: '2-digit', month: '2-digit', year: 'numeric' });
        }

        function formatNumber(n) {
            if (n == null || isNaN(n)) return '—';
            return Number(n).toLocaleString('de-CH');
        }

        // Simple Mapbox popup for feature info
        var featurePopup = null;
        function showFeaturePopup(lngLat, title, rows) {
            if (featurePopup) featurePopup.remove();
            var html = '<strong>' + escapeHtml(title) + '</strong><table style="margin-top:6px;border-collapse:collapse;font-size:13px">';
            rows.forEach(function(row) {
                var label = row[0];
                var value = row[1];
                var suffix = row[2] || '';
                var display = (value != null && value !== '') ? escapeHtml(String(value)) + suffix : '—';
                html += '<tr><td style="padding:2px 8px 2px 0;color:#666">' + escapeHtml(label) + '</td><td style="padding:2px 0">' + display + '</td></tr>';
            });
            html += '</table>';
            featurePopup = new mapboxgl.Popup({ closeButton: true, closeOnClick: true, maxWidth: '280px' })
                .setLngLat(lngLat)
                .setHTML(html)
                .addTo(map);
        }

        var conditionColors = {
            1: '#2e7d32', 2: '#689f38', 3: '#fbc02d', 4: '#ef6c00', 5: '#c62828'
        };
        var conditionLabels = {
            1: 'Sehr gut', 2: 'Gut', 3: 'Befriedigend', 4: 'Mangelhaft', 5: 'Ungenügend'
        };
        var taskStatusClasses = {
            'Geplant': 'status-planning',
            'In Bearbeitung': 'status-renovation',
            'Abgeschlossen': 'status-active',
            'Abgenommen': 'status-inactive'
        };
        var monthNames = ['Jan', 'Feb', 'Mär', 'Apr', 'Mai', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dez'];


        // ===== TASKS VIEW =====

        var tasksViewTab = 'calendar';

        function renderTasksView() {
            if (!taskData) return;
            var container = document.getElementById('tasks-view');
            if (!container) return;

            // Summary counts
            var total = taskData.length;
            var open = taskData.filter(function(t) { return t.status === 'Geplant' || t.status === 'In Bearbeitung'; }).length;
            var done = taskData.filter(function(t) { return t.status === 'Abgeschlossen' || t.status === 'Abgenommen'; }).length;
            var overdue = taskData.filter(function(t) {
                return (t.status === 'Geplant' || t.status === 'In Bearbeitung') && new Date(t.dueDate) < new Date();
            }).length;

            var html = '<div class="tasks-view-container">' +
                '<div class="tasks-header">' +
                    '<h2>Massnahmenplanung</h2>' +
                    '<div class="tasks-summary">' +
                        '<span class="tasks-summary-item"><strong>' + total + '</strong> Gesamt</span>' +
                        '<span class="tasks-summary-item tasks-summary-open"><strong>' + open + '</strong> Offen</span>' +
                        '<span class="tasks-summary-item tasks-summary-done"><strong>' + done + '</strong> Erledigt</span>' +
                        (overdue > 0 ? '<span class="tasks-summary-item tasks-summary-overdue"><strong>' + overdue + '</strong> Überfällig</span>' : '') +
                    '</div>' +
                '</div>' +
                '<div class="tasks-tabs">' +
                    '<button class="tasks-tab' + (tasksViewTab === 'calendar' ? ' active' : '') + '" data-tasks-tab="calendar"><span class="material-symbols-outlined">calendar_month</span> Kalender</button>' +
                    '<button class="tasks-tab' + (tasksViewTab === 'list' ? ' active' : '') + '" data-tasks-tab="list"><span class="material-symbols-outlined">list</span> Liste</button>' +
                    '<button class="tasks-tab' + (tasksViewTab === 'planner' ? ' active' : '') + '" data-tasks-tab="planner"><span class="material-symbols-outlined">grid_on</span> Jahresplaner</button>' +
                '</div>' +
                '<div class="tasks-tab-content">';

            if (tasksViewTab === 'calendar') {
                html += renderTasksCalendar();
            } else if (tasksViewTab === 'list') {
                html += renderTasksList();
            } else if (tasksViewTab === 'planner') {
                html += renderJahresplaner();
            }

            html += '</div></div>';
            container.innerHTML = html;

            // Wire up tab clicks
            container.querySelectorAll('.tasks-tab').forEach(function(tab) {
                tab.addEventListener('click', function() {
                    tasksViewTab = tab.dataset.tasksTab;
                    renderTasksView();
                });
            });
        }

        function renderTasksCalendar() {
            var byMonth = {};
            taskData.forEach(function(t) {
                var m = t.dueDateMonth || new Date(t.dueDate).getMonth() + 1;
                if (!byMonth[m]) byMonth[m] = [];
                byMonth[m].push(t);
            });

            var html = '<div class="tasks-calendar">';
            for (var m = 1; m <= 12; m++) {
                var tasks = byMonth[m] || [];
                var hasContent = tasks.length > 0;
                html += '<div class="calendar-month' + (hasContent ? '' : ' calendar-month-empty') + '">' +
                    '<div class="calendar-month-header">' +
                        '<span class="calendar-month-name">' + monthNames[m - 1] + '</span>' +
                        (hasContent ? '<span class="calendar-month-count">' + tasks.length + '</span>' : '') +
                    '</div>' +
                    '<div class="calendar-month-body">';

                tasks.forEach(function(t) {
                    var statusClass = taskStatusClasses[t.status] || 'status-inactive';
                    var priorityClass = t.priority === 'Hoch' ? 'priority-high' : t.priority === 'Mittel' ? 'priority-medium' : 'priority-low';
                    var typeIcon = t.taskType === 'Pflege' ? 'eco' :
                                   t.taskType === 'Inspektion' ? 'search' :
                                   t.taskType === 'Sanierung' ? 'build' :
                                   t.taskType === 'Neophytenbekämpfung' ? 'bug_report' : 'task_alt';
                    html += '<div class="task-card">' +
                        '<div class="task-card-header">' +
                            '<span class="material-symbols-outlined task-type-icon">' + typeIcon + '</span>' +
                            '<span class="task-priority-badge ' + priorityClass + '">' + escapeHtml(t.priority) + '</span>' +
                            '<span class="status-badge ' + statusClass + '">' + escapeHtml(t.status) + '</span>' +
                        '</div>' +
                        '<div class="task-card-title">' + escapeHtml(t.title) + '</div>' +
                        '<div class="task-card-meta">' +
                            '<span><span class="material-symbols-outlined" style="font-size:14px">person</span> ' + getContactName(t.assignedContactId) + '</span>' +
                            '<span>' + formatDateShort(t.dueDate) + '</span>' +
                        '</div>';

                    if (t.checklist && t.checklist.length > 0) {
                        var checked = t.checklist.filter(function(c) { return c.done; }).length;
                        html += '<div class="task-card-progress"><div class="task-progress-bar"><div class="task-progress-fill" style="width:' + Math.round(checked / t.checklist.length * 100) + '%"></div></div><span>' + checked + '/' + t.checklist.length + '</span></div>';
                    }
                    html += '</div>';
                });

                html += '</div></div>';
            }
            html += '</div>';
            return html;
        }

        function renderTasksList() {
            var sorted = taskData.slice().sort(function(a, b) { return new Date(a.dueDate) - new Date(b.dueDate); });
            var html = '<div class="tasks-list-table"><table>' +
                '<thead><tr><th>Status</th><th>Priorität</th><th>Titel</th><th>Typ</th><th>Zugewiesen</th><th>Fällig</th><th>Aufwand</th></tr></thead><tbody>';
            sorted.forEach(function(t) {
                var statusClass = taskStatusClasses[t.status] || 'status-inactive';
                var priorityClass = t.priority === 'Hoch' ? 'priority-high' : t.priority === 'Mittel' ? 'priority-medium' : 'priority-low';
                html += '<tr>' +
                    '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(t.status) + '</span></td>' +
                    '<td><span class="task-priority-badge ' + priorityClass + '">' + escapeHtml(t.priority) + '</span></td>' +
                    '<td>' + escapeHtml(t.title) + '</td>' +
                    '<td>' + escapeHtml(t.taskType) + '</td>' +
                    '<td>' + getContactName(t.assignedContactId) + '</td>' +
                    '<td>' + formatDateShort(t.dueDate) + '</td>' +
                    '<td>' + (t.actualHours || t.plannedHours || '—') + ' h</td>' +
                    '</tr>';
            });
            html += '</tbody></table></div>';
            return html;
        }

        function renderJahresplaner() {
            // Collect all green areas with care profiles
            var areas = [];
            if (greenAreaData && greenAreaData.features) {
                greenAreaData.features.forEach(function(f) {
                    if (f.properties.careProfileId) areas.push({ id: f.properties.lawnId || f.properties.greenAreaId, name: f.properties.name || f.properties.lawnId, careProfileId: f.properties.careProfileId });
                });
            }
            // Also lawns loaded separately
            if (plantingData && plantingData.features) {
                plantingData.features.forEach(function(f) {
                    if (f.properties.careProfileId) areas.push({ id: f.properties.plantingId, name: f.properties.name || f.properties.plantingId, careProfileId: f.properties.careProfileId });
                });
            }

            var html = '<div class="planner-grid"><table><thead><tr><th class="planner-area-col">Fläche / Profil</th>';
            for (var m = 1; m <= 12; m++) { html += '<th>' + monthNames[m - 1] + '</th>'; }
            html += '</tr></thead><tbody>';

            areas.forEach(function(area) {
                var cp = getCareProfile(area.careProfileId);
                var profileName = cp ? cp.name : area.careProfileId;
                var color = cp ? cp.mapColor : '#999';
                html += '<tr><td class="planner-area-col"><strong>' + escapeHtml(area.name) + '</strong><br><span class="planner-profile-label" style="color:' + color + '">' + escapeHtml(profileName) + '</span></td>';

                for (var m = 1; m <= 12; m++) {
                    var actions = [];
                    if (cp && cp.careActions) {
                        cp.careActions.forEach(function(ca) {
                            if (ca.timingMonths && ca.timingMonths.indexOf(m) !== -1) {
                                actions.push(ca.actionName);
                            }
                        });
                    }
                    if (actions.length > 0) {
                        html += '<td class="planner-cell-active" style="background:' + color + '22;border-left:3px solid ' + color + '">' +
                            actions.map(function(a) { return '<span class="planner-action">' + escapeHtml(a) + '</span>'; }).join('') + '</td>';
                    } else {
                        html += '<td class="planner-cell-empty"></td>';
                    }
                }
                html += '</tr>';
            });

            html += '</tbody></table></div>';
            return html;
        }

        // ===== DASHBOARD VIEW =====

        function renderDashboardView() {
            var container = document.getElementById('dashboard-view');
            if (!container) return;

            // Calculate KPIs
            var totalGreenArea = 0;
            var allAreas = [];
            if (greenAreaData && greenAreaData.features) {
                greenAreaData.features.forEach(function(f) { totalGreenArea += (f.properties.areaM2 || 0); allAreas.push(f.properties); });
            }
            if (plantingData && plantingData.features) {
                plantingData.features.forEach(function(f) { totalGreenArea += (f.properties.areaM2 || 0); allAreas.push(f.properties); });
            }

            var treeCount = treeData && treeData.features ? treeData.features.length : 0;
            var openTasks = taskData ? taskData.filter(function(t) { return t.status === 'Geplant' || t.status === 'In Bearbeitung'; }).length : 0;

            // Soll/Ist calculation
            var sollTotal = 0;
            allAreas.forEach(function(a) {
                var cp = getCareProfile(a.careProfileId);
                if (cp && a.areaM2) { sollTotal += cp.costPerM2Year * a.areaM2; }
            });

            var istTotal = 0;
            var budgetTotal = 0;
            var costByCategory = {};
            if (costData) {
                costData.forEach(function(c) {
                    if (c.isActual) {
                        istTotal += c.amount;
                    } else {
                        budgetTotal += c.amount;
                    }
                    if (!costByCategory[c.costCategory]) costByCategory[c.costCategory] = { budget: 0, actual: 0 };
                    if (c.isActual) {
                        costByCategory[c.costCategory].actual += c.amount;
                    } else {
                        costByCategory[c.costCategory].budget += c.amount;
                    }
                });
            }
            var budgetUtilization = budgetTotal > 0 ? Math.round(istTotal / budgetTotal * 100) : 0;

            // Ecology
            var co2SeqTotal = 0, co2StoredTotal = 0, replacementTotal = 0;
            var nativeCount = 0, totalTrees = 0;
            if (treeData && treeData.features) {
                treeData.features.forEach(function(f) {
                    var p = f.properties;
                    co2SeqTotal += (p.co2SequestrationKgYr || 0);
                    co2StoredTotal += (p.co2StoredKg || 0);
                    replacementTotal += (p.replacementValueCHF || 0);
                    totalTrees++;
                    if (p.establishmentMeans === 'Einheimisch') nativeCount++;
                });
            }
            var nativePercent = totalTrees > 0 ? Math.round(nativeCount / totalTrees * 100) : 0;

            // Canopy cover from sites
            var avgCanopy = 0;
            if (sitesData && sitesData.features && sitesData.features.length > 0) {
                var canopySum = 0;
                sitesData.features.forEach(function(f) { canopySum += (f.properties.canopyCoverPercent || 0); });
                avgCanopy = Math.round(canopySum / sitesData.features.length);
            }

            // Biodiversity: count extensive profiles
            var extensiveCount = 0, intensiveCount = 0;
            allAreas.forEach(function(a) {
                var cp = getCareProfile(a.careProfileId);
                if (cp) {
                    if (cp.ecologyRating >= 4) extensiveCount++;
                    else intensiveCount++;
                }
            });
            var extensivePercent = (extensiveCount + intensiveCount) > 0 ? Math.round(extensiveCount / (extensiveCount + intensiveCount) * 100) : 0;

            var avgBiodiversity = 0;
            if (sitesData && sitesData.features && sitesData.features.length > 0) {
                var bioSum = 0;
                sitesData.features.forEach(function(f) { bioSum += (f.properties.biodiversityScore || 0); });
                avgBiodiversity = (bioSum / sitesData.features.length).toFixed(1);
            }

            // Build HTML
            var html = '<div class="dashboard-container">' +
                // KPI Cards
                '<div class="kpi-cards-row">' +
                    '<div class="kpi-card"><span class="material-symbols-outlined kpi-icon" style="color:#4caf50">grass</span><div class="kpi-value">' + formatNumber(Math.round(totalGreenArea)) + ' m²</div><div class="kpi-label">Grünfläche gesamt</div></div>' +
                    '<div class="kpi-card"><span class="material-symbols-outlined kpi-icon" style="color:#2e7d32">forest</span><div class="kpi-value">' + treeCount + '</div><div class="kpi-label">Bäume</div></div>' +
                    '<div class="kpi-card"><span class="material-symbols-outlined kpi-icon" style="color:#ef6c00">task_alt</span><div class="kpi-value">' + openTasks + '</div><div class="kpi-label">Offene Aufgaben</div></div>' +
                    '<div class="kpi-card"><span class="material-symbols-outlined kpi-icon" style="color:#1976d2">account_balance</span><div class="kpi-value">' + budgetUtilization + ' %</div><div class="kpi-label">Budget-Auslastung</div></div>' +
                '</div>' +

                // Cost section
                '<div class="dashboard-grid">' +
                    // Soll/Ist
                    '<div class="dashboard-card">' +
                        '<h3><span class="material-symbols-outlined">payments</span> Soll/Ist-Vergleich</h3>' +
                        '<div class="cost-comparison">' +
                            '<div class="cost-row"><span class="cost-label">Budget (Soll)</span><span class="cost-value">' + formatNumber(Math.round(budgetTotal)) + ' CHF</span></div>' +
                            '<div class="cost-bar-container"><div class="cost-bar cost-bar-soll" style="width:100%"></div></div>' +
                            '<div class="cost-row"><span class="cost-label">Effektiv (Ist)</span><span class="cost-value">' + formatNumber(Math.round(istTotal)) + ' CHF</span></div>' +
                            '<div class="cost-bar-container"><div class="cost-bar cost-bar-ist" style="width:' + Math.min(100, budgetUtilization) + '%"></div></div>' +
                            '<div class="cost-row cost-row-diff"><span class="cost-label">Differenz</span><span class="cost-value">' + (budgetTotal - istTotal >= 0 ? '+' : '') + formatNumber(Math.round(budgetTotal - istTotal)) + ' CHF</span></div>' +
                        '</div>' +
                        '<div class="cost-profile-estimate">' +
                            '<h4>Profilbasierte Kostenschätzung</h4>' +
                            '<div class="cost-row"><span class="cost-label">Σ Profil × Fläche</span><span class="cost-value">' + formatNumber(Math.round(sollTotal)) + ' CHF/Jahr</span></div>' +
                        '</div>' +
                    '</div>' +

                    // Cost by Category
                    '<div class="dashboard-card">' +
                        '<h3><span class="material-symbols-outlined">donut_large</span> Kosten nach Kategorie</h3>' +
                        '<div class="cost-categories">';

            var categoryColors = { 'Personal': '#1976d2', 'Material': '#4caf50', 'Fremdleistung': '#ef6c00', 'Maschinen': '#9c27b0', 'Entsorgung': '#795548', 'Wasser': '#00bcd4' };
            var totalCost = budgetTotal + istTotal;
            Object.keys(costByCategory).forEach(function(cat) {
                var catTotal = costByCategory[cat].budget + costByCategory[cat].actual;
                var pct = totalCost > 0 ? Math.round(catTotal / totalCost * 100) : 0;
                var color = categoryColors[cat] || '#999';
                html += '<div class="cost-category-row">' +
                    '<span class="cost-category-label"><span class="cost-category-dot" style="background:' + color + '"></span>' + escapeHtml(cat) + '</span>' +
                    '<span class="cost-category-value">' + formatNumber(Math.round(catTotal)) + ' CHF</span>' +
                    '</div>' +
                    '<div class="cost-bar-container"><div class="cost-bar" style="width:' + pct + '%;background:' + color + '"></div></div>';
            });

            html += '</div></div>' +

                // Ecology
                '<div class="dashboard-card">' +
                    '<h3><span class="material-symbols-outlined">eco</span> Ökologie-Indikatoren</h3>' +
                    '<div class="ecology-indicators">' +
                        '<div class="ecology-row"><span class="ecology-label">Biodiversitäts-Score</span><span class="ecology-value ecology-value-highlight">' + avgBiodiversity + ' / 5</span></div>' +
                        '<div class="ecology-row"><span class="ecology-label">Einheimische Arten</span><span class="ecology-value">' + nativePercent + ' %</span></div>' +
                        '<div class="cost-bar-container"><div class="cost-bar" style="width:' + nativePercent + '%;background:#4caf50"></div></div>' +
                        '<div class="ecology-row"><span class="ecology-label">Extensiv gepflegt</span><span class="ecology-value">' + extensivePercent + ' %</span></div>' +
                        '<div class="cost-bar-container"><div class="cost-bar" style="width:' + extensivePercent + '%;background:#8bc34a"></div></div>' +
                        '<div class="ecology-row"><span class="ecology-label">Kronendachanteil</span><span class="ecology-value">' + avgCanopy + ' %</span></div>' +
                        '<div class="cost-bar-container"><div class="cost-bar" style="width:' + avgCanopy + '%;background:#2e7d32"></div></div>' +
                    '</div>' +
                '</div>' +

                // Ecosystem Services
                '<div class="dashboard-card">' +
                    '<h3><span class="material-symbols-outlined">park</span> Ökosystemleistungen</h3>' +
                    '<div class="ecosystem-services">' +
                        '<div class="eco-service-row"><span class="material-symbols-outlined eco-service-icon" style="color:#4caf50">co2</span><div class="eco-service-data"><div class="eco-service-value">' + formatNumber(Math.round(co2SeqTotal)) + ' kg/Jahr</div><div class="eco-service-label">CO₂-Bindung</div></div></div>' +
                        '<div class="eco-service-row"><span class="material-symbols-outlined eco-service-icon" style="color:#2e7d32">inventory_2</span><div class="eco-service-data"><div class="eco-service-value">' + formatNumber(Math.round(co2StoredTotal)) + ' kg</div><div class="eco-service-label">CO₂ gespeichert</div></div></div>' +
                        '<div class="eco-service-row"><span class="material-symbols-outlined eco-service-icon" style="color:#ef6c00">account_balance_wallet</span><div class="eco-service-data"><div class="eco-service-value">' + formatNumber(Math.round(replacementTotal)) + ' CHF</div><div class="eco-service-label">Baumwert (Ersatzwert)</div></div></div>' +
                    '</div>' +
                '</div>' +

                '</div></div>';

            container.innerHTML = html;
        }

        // ===== MAP CLICK HANDLERS FOR GREEN FEATURES =====

        function addGreenFeatureClickHandlers() {
            // Tree click popup
            if (treeData && treeData.features && map.getLayer('trees-points')) {
                map.on('click', 'trees-points', function(e) {
                    if (e.features && e.features.length > 0) {
                        var props = e.features[0].properties;
                        showFeaturePopup(e.lngLat, 'Baum', [
                            ['ID', props.treeId],
                            ['Art', props.commonNameDe || props.species],
                            ['Kategorie', props.treeCategory],
                            ['Höhe', props.heightM, ' m'],
                            ['Stammumfang', props.trunkCircumferenceCm, ' cm'],
                            ['Zustand', props.condition],
                            ['Pflanzjahr', props.plantingYear]
                        ]);
                    }
                });
                map.on('mouseenter', 'trees-points', function() { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', 'trees-points', function() { map.getCanvas().style.cursor = ''; });
            }

            // Furniture click popup
            if (furnitureData && furnitureData.features && map.getLayer('furniture-points')) {
                map.on('click', 'furniture-points', function(e) {
                    if (e.features && e.features.length > 0) {
                        var props = e.features[0].properties;
                        showFeaturePopup(e.lngLat, 'Mobiliar', [
                            ['ID', props.furnitureId],
                            ['Name', props.name],
                            ['Typ', props.furnitureType],
                            ['Material', props.material],
                            ['Zustand', props.condition],
                            ['Einbaujahr', props.installationYear]
                        ]);
                    }
                });
                map.on('mouseenter', 'furniture-points', function() { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', 'furniture-points', function() { map.getCanvas().style.cursor = ''; });
            }

            // Green area (lawn) click popup
            if (greenAreaData && greenAreaData.features && map.getLayer('lawns-fill')) {
                map.on('click', 'lawns-fill', function(e) {
                    if (e.features && e.features.length > 0) {
                        var props = e.features[0].properties;
                        showFeaturePopup(e.lngLat, 'Grünfläche', [
                            ['ID', props.lawnId || props.greenAreaId],
                            ['Name', props.name],
                            ['Typ', props.lawnType],
                            ['Fläche', props.areaM2, ' m²'],
                            ['Zustand', props.condition],
                            ['Bewässert', props.irrigated ? 'Ja' : 'Nein']
                        ]);
                    }
                });
            }

            // Surface click popup
            if (surfaceData && surfaceData.features && map.getLayer('surfaces-fill')) {
                map.on('click', 'surfaces-fill', function(e) {
                    if (e.features && e.features.length > 0) {
                        var props = e.features[0].properties;
                        showFeaturePopup(e.lngLat, 'Belagsfläche', [
                            ['ID', props.surfaceId],
                            ['Name', props.name],
                            ['Typ', props.surfaceType],
                            ['Material', props.material],
                            ['Fläche', props.areaM2, ' m²'],
                            ['Zustand', props.condition],
                            ['Entwässerung', props.drainageType]
                        ]);
                    }
                });
                map.on('mouseenter', 'surfaces-fill', function() { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', 'surfaces-fill', function() { map.getCanvas().style.cursor = ''; });
            }

            // Garden click popup
            if (gardenData && gardenData.features && map.getLayer('gardens-fill')) {
                map.on('click', 'gardens-fill', function(e) {
                    if (e.features && e.features.length > 0) {
                        var props = e.features[0].properties;
                        showFeaturePopup(e.lngLat, 'Garten', [
                            ['ID', props.gardenId],
                            ['Name', props.name],
                            ['Typ', props.gardenType],
                            ['Fläche', props.areaM2, ' m²'],
                            ['Zustand', props.condition],
                            ['Denkmalschutz', props.heritageStatus],
                            ['Gestalter', props.originalDesigner]
                        ]);
                    }
                });
                map.on('mouseenter', 'gardens-fill', function() { map.getCanvas().style.cursor = 'pointer'; });
                map.on('mouseleave', 'gardens-fill', function() { map.getCanvas().style.cursor = ''; });
            }
        }
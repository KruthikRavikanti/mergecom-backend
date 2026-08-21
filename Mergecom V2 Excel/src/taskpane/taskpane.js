/* global console, document, Excel, Office */

Office.onReady((info) => {
  if (info.host === Office.HostType.Excel) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("run").onclick = run;
  }
});

export async function run() {
  try {
    await Excel.run(async (context) => {
      const range = context.workbook.getSelectedRange();
      range.load("address");
      range.format.fill.color = "yellow";
      await context.sync();
    });
  } catch (error) {
    console.error(error);
  }
}

// ====================================
// 🔧 HELPER FUNCTIONS
// ====================================

/**
 * Extracts data, formulas and formatting from a single worksheet
 * @param {Excel.Worksheet} worksheet - The worksheet to extract from
 * @returns {Object|null} Sheet data object or null if empty
 */
async function extractSheetData(worksheet, context) {
  // grab values and formulas
  const range = worksheet.getUsedRangeOrNullObject(true);
  range.load(["values", "formulas", "rowIndex", "columnIndex"]);
  await context.sync();

  if (range.isNullObject) {
    return null;
  }

  // Load formatting properties
  range.format.load(["fill", "font"]);
  await context.sync();
  range.format.fill.load("color");
  range.format.font.load(["name", "size", "color", "bold"]);
  await context.sync();

  const sheetData = {
    name: worksheet.name,
    values: range.values,
    formulas: range.formulas,
    startRow: range.rowIndex,
    startColumn: range.columnIndex,
    format: {
      fillColor: range.format.fill.color,
      font: {
        name:  range.format.font.name,
        size:  range.format.font.size,
        color: range.format.font.color,
        bold:  range.format.font.bold,
      }
    }
  };

  return sheetData;
}


/**
 * Sends workbook data to the server
 * @param {Array} workbookData - Array of sheet data objects
 * @returns {Promise<boolean>} Success status
 */
async function sendDataToServer(workbookData) {
  const payload = { workbook: workbookData };

  try {
    const response = await fetch("https://localhost:3001/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      console.log("✅ Push successful");
      return true;
    } else {
      const errorText = await response.text();
      console.error("❌ Server error:", errorText);
      throw new Error(errorText);
    }
  } catch (error) {
    console.error("❌ Network error:", error);
    throw error;
  }
}

/**
 * Fetches workbook data from the server
 * @returns {Promise<Array>} Array of sheet data objects
 */
async function fetchDataFromServer() {
  console.log("📥 Fetching data from server...");
  
  const response = await fetch("https://localhost:3001/load");
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();

  // Validate structure
  if (!data.workbook || !Array.isArray(data.workbook)) {
    throw new Error("Invalid data format: workbook must be an array");
  }

  if (data.workbook.length === 0) {
    throw new Error("No saved workbook data found");
  }

  return data.workbook;
}

/**
 * Generates a unique sheet name to avoid conflicts
 * @param {string} desiredName - The desired sheet name
 * @param {Array} existingSheets - Array of existing sheet objects
 * @returns {string} Unique sheet name
 */
function generateUniqueSheetName(desiredName, existingSheets) {
  let sheetName = desiredName || "Sheet";
  let counter = 1;
  
  while (existingSheets.some(s => s.name === sheetName)) {
    sheetName = `${desiredName || "Sheet"}_${counter}`;
    counter++;
  }
  
  return sheetName;
}

/**
 * Creates a new sheet and populates it with data
 * @param {Excel.WorksheetCollection} sheets - The worksheet collection
 * @param {Object} wsData - The worksheet data to restore
 * @param {Array} existingSheets - Array of existing sheet objects
 * @returns {string} The name of the created sheet
 */
async function createSheetWithData(sheets, wsData, existingSheets, context) {
  const sheetName = generateUniqueSheetName(wsData.name, existingSheets);
  const newSheet = sheets.add(sheetName);
  
  if (wsData.values && wsData.values.length > 0 && wsData.values[0].length > 0) {
    await populateSheetData(newSheet, wsData, context);
  }
  
  return sheetName;
}

/**
 * Populates a sheet with values or formulas (plus formatting)
 * @param {Excel.Worksheet} sheet - The worksheet to populate
 * @param {Object} wsData - The worksheet data (with values, formulas, format, etc.)
 */
async function populateSheetData(sheet, wsData, context) {
  const rowCount   = wsData.values.length;
  const colCount   = wsData.values[0].length;
  const startRow   = wsData.startRow   || 0;
  const startCol   = wsData.startColumn|| 0;
  const range = sheet.getRangeByIndexes(startRow, startCol, rowCount, colCount);

  // restore formulas if present, otherwise plain values
  if (wsData.formulas) {
    range.formulas = wsData.formulas;
  } else {
    range.values = wsData.values;
  }

  // re-apply formatting
  if (wsData.format) {
    await applyFormatting(range, wsData.format, context);
  }
}


/**
 * Applies formatting to a range
 * @param {Excel.Range} range - The range to format
 * @param {Object} formatData - The formatting data
 */
async function applyFormatting(range, formatData, context) {
  if (formatData.fillColor) {
    range.format.fill.color = formatData.fillColor;
  }
  
  if (formatData.font) {
    const font = formatData.font;
    if (font.name) range.format.font.name = font.name;
    if (font.size) range.format.font.size = font.size;
    if (font.color) range.format.font.color = font.color;
    if (typeof font.bold === "boolean") range.format.font.bold = font.bold;
  }
}

/**
 * Safely removes old sheets while maintaining at least one sheet
 * @param {Excel.WorksheetCollection} sheets - The worksheet collection
 * @param {Array} newSheetNames - Names of newly created sheets
 */
async function removeOldSheets(sheets, newSheetNames, context) {
  console.log("🗑️ Removing old sheets...");
  
  // Reload sheets to get updated list including new sheets
  sheets.load("items/name");
  await context.sync();
  
  const originalSheets = sheets.items.filter(sheet => 
    !newSheetNames.includes(sheet.name)
  );
  
  // Delete all but the last original sheet
  for (let i = 0; i < originalSheets.length - 1; i++) {
    originalSheets[i].delete();
  }
  
  // Delete the last original sheet only if we have new sheets
  if (newSheetNames.length > 0 && originalSheets.length > 0) {
    originalSheets[originalSheets.length - 1].delete();
  }
}

/**
 * Updates the UI with a message
 * @param {string} message - The message to display
 */
function updateUI(message) {
  const outputElement = document.getElementById("output");
  if (outputElement) {
    outputElement.innerText = message;
  }
}

// ====================================
// 🚀 MAIN FUNCTIONS
// ====================================

/**
 * 📤 Push: Extract workbook data and save to server
 */
async function pushFromExcel() {
  try {
    await Excel.run(async (context) => {
      const workbook = context.workbook;
      const worksheets = workbook.worksheets;
      worksheets.load("items/name");
      await context.sync();

      const workbookData = [];

      // Extract data from each worksheet
      for (const ws of worksheets.items) {
        const sheetData = await extractSheetData(ws, context);
        if (sheetData) {
          workbookData.push(sheetData);
        }
      }

      // Send data to server
      await sendDataToServer(workbookData);
      updateUI("✅ Excel workbook pushed successfully!");
    });
  } catch (error) {
    console.error("❌ Push failed:", error);
    updateUI("❌ Push failed: " + error.message);
  }
}

/**
 * 📥 Pull: Load workbook data from server and rebuild Excel
 */
async function pullToExcel() {
  try {
    // Fetch data from server
    const workbookData = await fetchDataFromServer();

    await Excel.run(async (context) => {
      const sheets = context.workbook.worksheets;
      sheets.load("items/name");
      await context.sync();

      // Create new sheets first (before deleting existing ones)
      console.log("🔨 Creating new sheets...");
      const newSheetNames = [];
      
      for (const wsData of workbookData) {
        const sheetName = await createSheetWithData(sheets, wsData, sheets.items, context);
        newSheetNames.push(sheetName);
      }

      await context.sync();

      // Remove old sheets safely
      await removeOldSheets(sheets, newSheetNames, context);
      await context.sync();

      console.log("✅ Pull completed successfully");
      updateUI("✅ Excel workbook pulled and rebuilt successfully!");
    });
  } catch (error) {
    console.error("❌ Pull failed:", error);
    if (error.message === "No saved workbook data found") {
      updateUI("📄 No saved workbook data found");
    } else {
      updateUI("❌ Pull failed: " + error.message);
    }
  }
}

// ====================================
// 🌐 GLOBAL EXPORTS
// ====================================

// Make functions available globally
window.pushFromExcel = pushFromExcel;
window.pullToExcel = pullToExcel;

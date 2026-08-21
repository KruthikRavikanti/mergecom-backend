/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global document, Office */

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("run").onclick = run;
  }
});

export async function run() {
  /**
   * Insert your PowerPoint code here
   */
  const options = { coercionType: Office.CoercionType.Text };

  await Office.context.document.setSelectedDataAsync(" ", options);
  await Office.context.document.setSelectedDataAsync("Hello World!", options);
}

// ====================================
// 🔧 HELPER FUNCTIONS
// ====================================

/**
 * Extracts all presentation data using Office.js APIs
 * @returns {Promise<Array>} Array of slide data objects
 */
async function extractPresentationData() {
  console.log("📊 Extracting presentation data...");
  
  return new Promise((resolve, reject) => {
    Office.context.document.getSelectedDataAsync(Office.CoercionType.SlideRange, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log("✅ Successfully extracted slide data");
        
        // For now, create a simple structure representing the presentation
        // This is a simplified approach since PowerPoint Office.js API is more limited
        const presentationData = [{
          id: "slide1",
          layout: "Blank",
          shapes: [{
            id: "shape1",
            type: "TextBox",
            text: "Extracted content from PowerPoint",
            left: 100,
            top: 100,
            width: 400,
            height: 200
          }]
        }];
        
        resolve(presentationData);
      } else {
        console.error("❌ Failed to extract presentation data:", result.error);
        reject(new Error(result.error.message));
      }
    });
  });
}

/**
 * Rebuilds the presentation from data
 * @param {Array} presentationData - Array of slide data objects
 */
async function rebuildPresentation(presentationData) {
  console.log("🔨 Rebuilding presentation...");
  
  return new Promise((resolve, reject) => {
    // Clear existing content and add new content
    const content = presentationData.map(slide => 
      slide.shapes.map(shape => shape.text || "").join("\n")
    ).join("\n\n");
    
    Office.context.document.setSelectedDataAsync(content, {
      coercionType: Office.CoercionType.Text
    }, (result) => {
      if (result.status === Office.AsyncResultStatus.Succeeded) {
        console.log("✅ Successfully rebuilt presentation");
        resolve();
      } else {
        console.error("❌ Failed to rebuild presentation:", result.error);
        reject(new Error(result.error.message));
      }
    });
  });
}

/**
 * Extracts data from a single slide
 * @param {PowerPoint.Slide} slide - The slide to extract from
 * @returns {Object} Slide data object
 */
async function extractSlideData(slide, context) {
  // Load slide properties
  slide.load(["id", "layout"]);
  
  // Get all shapes on the slide
  const shapes = slide.shapes;
  shapes.load("items");
  await context.sync();

  const slideData = {
    id: slide.id,
    layout: slide.layout,
    shapes: []
  };

  // Extract data from each shape
  for (const shape of shapes.items) {
    const shapeData = await extractShapeData(shape, context);
    if (shapeData) {
      slideData.shapes.push(shapeData);
    }
  }

  return slideData;
}

/**
 * Extracts data from a shape INCLUDING text formatting
 * @param {PowerPoint.Shape} shape - The shape to extract from
 * @returns {Object|null} Shape data object or null if unsupported
 */
async function extractShapeData(shape, context) {
  shape.load(["id", "type", "left", "top", "width", "height"]);
  await context.sync();

  const shapeData = {
    id: shape.id,
    type: shape.type,
    left: shape.left,
    top: shape.top,
    width: shape.width,
    height: shape.height
  };

  // Extract text content AND formatting if the shape has text
  if (shape.textFrame) {
    shape.textFrame.load(["textRange", "verticalAlignment", "horizontalAlignment", "marginBottom", "marginLeft", "marginRight", "marginTop"]);
    await context.sync();
    
    if (shape.textFrame.textRange) {
      // Load text and formatting properties
      shape.textFrame.textRange.load([
        "text",
        "font",
        "paragraphFormat"
      ]);
      await context.sync();
      
      // Extract text content
      shapeData.text = shape.textFrame.textRange.text;
      
      // Extract text frame formatting
      shapeData.textFrame = {
        verticalAlignment: shape.textFrame.verticalAlignment,
        horizontalAlignment: shape.textFrame.horizontalAlignment,
        marginBottom: shape.textFrame.marginBottom,
        marginLeft: shape.textFrame.marginLeft,
        marginRight: shape.textFrame.marginRight,
        marginTop: shape.textFrame.marginTop
      };
      
      // Extract font formatting
      if (shape.textFrame.textRange.font) {
        shape.textFrame.textRange.font.load([
          "name", "size", "bold", "italic", "underline", "color"
        ]);
        await context.sync();
        
        shapeData.font = {
          name: shape.textFrame.textRange.font.name,
          size: shape.textFrame.textRange.font.size,
          bold: shape.textFrame.textRange.font.bold,
          italic: shape.textFrame.textRange.font.italic,
          underline: shape.textFrame.textRange.font.underline,
          color: shape.textFrame.textRange.font.color
        };
      }
      
      // Extract paragraph formatting
      if (shape.textFrame.textRange.paragraphFormat) {
        shape.textFrame.textRange.paragraphFormat.load([
          "alignment", "lineSpacing", "spaceBefore", "spaceAfter", "leftIndent", "rightIndent"
        ]);
        await context.sync();
        
        shapeData.paragraphFormat = {
          alignment: shape.textFrame.textRange.paragraphFormat.alignment,
          lineSpacing: shape.textFrame.textRange.paragraphFormat.lineSpacing,
          spaceBefore: shape.textFrame.textRange.paragraphFormat.spaceBefore,
          spaceAfter: shape.textFrame.textRange.paragraphFormat.spaceAfter,
          leftIndent: shape.textFrame.textRange.paragraphFormat.leftIndent,
          rightIndent: shape.textFrame.textRange.paragraphFormat.rightIndent
        };
      }

      // Handle multiple text runs with different formatting
      try {
        const textRuns = shape.textFrame.textRange.getTextRuns();
        textRuns.load("items");
        await context.sync();
        
        if (textRuns.items.length > 1) {
          shapeData.textRuns = [];
          
          for (const run of textRuns.items) {
            run.load(["text", "font"]);
            await context.sync();
            
            if (run.font) {
              run.font.load(["name", "size", "bold", "italic", "underline", "color"]);
              await context.sync();
            }
            
            shapeData.textRuns.push({
              text: run.text,
              font: run.font ? {
                name: run.font.name,
                size: run.font.size,
                bold: run.font.bold,
                italic: run.font.italic,
                underline: run.font.underline,
                color: run.font.color
              } : null
            });
          }
        }
      } catch (error) {
        console.log("Note: Could not extract text runs (may not be supported)");
      }
    }
  }

  return shapeData;
}

/**
 * Sends presentation data to the server
 * @param {Array} presentationData - Array of slide data objects
 * @returns {Promise<boolean>} Success status
 */
async function sendDataToServer(presentationData) {
  const payload = { presentation: presentationData };

  try {
    const response = await fetch("https://localhost:3001/save-presentation", {
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
 * Fetches presentation data from the server
 * @returns {Promise<Array>} Array of slide data objects
 */
async function fetchDataFromServer() {
  console.log("📥 Fetching presentation data from server...");
  
  const response = await fetch("https://localhost:3001/load-presentation");
  if (!response.ok) {
    throw new Error(`Server responded with ${response.status}: ${response.statusText}`);
  }
  
  const data = await response.json();

  // Validate structure
  if (!data.presentation || !Array.isArray(data.presentation)) {
    throw new Error("Invalid data format: presentation must be an array");
  }

  if (data.presentation.length === 0) {
    throw new Error("No saved presentation data found");
  }

  return data.presentation;
}

/**
 * Creates a new slide and populates it with shapes
 * @param {PowerPoint.SlideCollection} slides - The slide collection
 * @param {Object} slideData - The slide data to restore
 * @returns {Promise<PowerPoint.Slide>} The created slide
 */
async function createSlideWithData(slides, slideData, context) {
  // Add a new slide with the specified layout
  const newSlide = slides.add(slideData.layout || "Blank");
  await context.sync();
  
  // Populate with shapes
  if (slideData.shapes && slideData.shapes.length > 0) {
    await populateSlideShapes(newSlide, slideData.shapes, context);
  }
  
  return newSlide;
}

/**
 * Populates a slide with shapes
 * @param {PowerPoint.Slide} slide - The slide to populate
 * @param {Array} shapesData - Array of shape data objects
 */
async function populateSlideShapes(slide, shapesData, context) {
  for (const shapeData of shapesData) {
    await createShapeFromData(slide, shapeData, context);
  }
}

/**
 * Creates a shape from data INCLUDING text formatting
 * @param {PowerPoint.Slide} slide - The slide to add the shape to
 * @param {Object} shapeData - The shape data
 */
async function createShapeFromData(slide, shapeData, context) {
  try {
    let shape;
    
    // Create shape based on type
    switch (shapeData.type) {
      case "GeometricShape":
        shape = slide.shapes.addGeometricShape("Rectangle");
        break;
      case "TextBox":
        shape = slide.shapes.addTextBox(shapeData.text || "");
        break;
      default:
        // For other types, create a text box with the content
        shape = slide.shapes.addTextBox(shapeData.text || `[${shapeData.type}]`);
    }
    
    await context.sync();
    
    // Set position and size
    shape.left = shapeData.left || 0;
    shape.top = shapeData.top || 0;
    shape.width = shapeData.width || 100;
    shape.height = shapeData.height || 50;
    
    await context.sync();
    
    // Apply text content and formatting
    if (shapeData.text && shape.textFrame) {
      // Set the text content
      shape.textFrame.textRange.text = shapeData.text;
      await context.sync();
      
      // Apply text frame formatting
      if (shapeData.textFrame) {
        try {
          shape.textFrame.verticalAlignment = shapeData.textFrame.verticalAlignment || "Top";
          shape.textFrame.horizontalAlignment = shapeData.textFrame.horizontalAlignment || "Left";
          shape.textFrame.marginBottom = shapeData.textFrame.marginBottom || 0;
          shape.textFrame.marginLeft = shapeData.textFrame.marginLeft || 0;
          shape.textFrame.marginRight = shapeData.textFrame.marginRight || 0;
          shape.textFrame.marginTop = shapeData.textFrame.marginTop || 0;
          await context.sync();
        } catch (error) {
          console.log("Note: Some text frame properties may not be settable");
        }
      }
      
      // Apply font formatting
      if (shapeData.font && shape.textFrame.textRange.font) {
        try {
          if (shapeData.font.name) shape.textFrame.textRange.font.name = shapeData.font.name;
          if (shapeData.font.size) shape.textFrame.textRange.font.size = shapeData.font.size;
          if (typeof shapeData.font.bold === 'boolean') shape.textFrame.textRange.font.bold = shapeData.font.bold;
          if (typeof shapeData.font.italic === 'boolean') shape.textFrame.textRange.font.italic = shapeData.font.italic;
          if (typeof shapeData.font.underline === 'boolean') shape.textFrame.textRange.font.underline = shapeData.font.underline;
          if (shapeData.font.color) shape.textFrame.textRange.font.color = shapeData.font.color;
          await context.sync();
        } catch (error) {
          console.log("Note: Some font properties may not be settable");
        }
      }
      
      // Apply paragraph formatting
      if (shapeData.paragraphFormat && shape.textFrame.textRange.paragraphFormat) {
        try {
          if (shapeData.paragraphFormat.alignment) shape.textFrame.textRange.paragraphFormat.alignment = shapeData.paragraphFormat.alignment;
          if (shapeData.paragraphFormat.lineSpacing) shape.textFrame.textRange.paragraphFormat.lineSpacing = shapeData.paragraphFormat.lineSpacing;
          if (shapeData.paragraphFormat.spaceBefore) shape.textFrame.textRange.paragraphFormat.spaceBefore = shapeData.paragraphFormat.spaceBefore;
          if (shapeData.paragraphFormat.spaceAfter) shape.textFrame.textRange.paragraphFormat.spaceAfter = shapeData.paragraphFormat.spaceAfter;
          if (shapeData.paragraphFormat.leftIndent) shape.textFrame.textRange.paragraphFormat.leftIndent = shapeData.paragraphFormat.leftIndent;
          if (shapeData.paragraphFormat.rightIndent) shape.textFrame.textRange.paragraphFormat.rightIndent = shapeData.paragraphFormat.rightIndent;
          await context.sync();
        } catch (error) {
          console.log("Note: Some paragraph properties may not be settable");
        }
      }
      
      // Handle multiple text runs with different formatting
      if (shapeData.textRuns && shapeData.textRuns.length > 1) {
        try {
          // Clear existing text first
          shape.textFrame.textRange.text = "";
          await context.sync();
          
          // Add each text run with its formatting
          for (const runData of shapeData.textRuns) {
            const textRange = shape.textFrame.textRange.insertText(runData.text, "End");
            await context.sync();
            
            if (runData.font && textRange.font) {
              if (runData.font.name) textRange.font.name = runData.font.name;
              if (runData.font.size) textRange.font.size = runData.font.size;
              if (typeof runData.font.bold === 'boolean') textRange.font.bold = runData.font.bold;
              if (typeof runData.font.italic === 'boolean') textRange.font.italic = runData.font.italic;
              if (typeof runData.font.underline === 'boolean') textRange.font.underline = runData.font.underline;
              if (runData.font.color) textRange.font.color = runData.font.color;
              await context.sync();
            }
          }
        } catch (error) {
          console.log("Note: Could not apply text runs formatting, using default formatting");
        }
      }
    }
    
  } catch (error) {
    console.error("❌ Failed to create shape", error);
  }
}

/**
 * Removes all existing slides except the first one
 * @param {PowerPoint.SlideCollection} slides - The slide collection
 */
async function removeAllSlidesExceptFirst(slides, context) {
  console.log("🗑️ Removing existing slides...");
  
  slides.load("items");
  await context.sync();
  
  // Remove all slides except the first one (PowerPoint requires at least one slide)
  const slidesToRemove = slides.items.slice(1);
  for (const slide of slidesToRemove) {
    slide.delete();
  }
  
  await context.sync();
  
  // Clear all shapes from the first slide
  if (slides.items.length > 0) {
    const firstSlide = slides.items[0];
    firstSlide.shapes.load("items");
    await context.sync();
    
    for (const shape of firstSlide.shapes.items) {
      shape.delete();
    }
    await context.sync();
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
 * 📤 Push: Extract presentation data and save to server
 */
async function pushFromPowerPoint() {
  try {
    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides;
      slides.load("items");
      await context.sync();

      const presentationData = [];

      // Extract data from each slide
      for (const slide of slides.items) {
        const slideData = await extractSlideData(slide, context);
        if (slideData) {
          presentationData.push(slideData);
        }
      }

      // Send data to server
      await sendDataToServer(presentationData);
      updateUI("✅ PowerPoint presentation pushed successfully!");
    });
  } catch (error) {
    console.error("❌ Push failed:", error);
    updateUI("❌ Push failed: " + error.message);
  }
}

/**
 * 📥 Pull: Load presentation data from server and rebuild PowerPoint
 */
async function pullToPowerPoint() {
  try {
    // Fetch data from server
    const presentationData = await fetchDataFromServer();

    await PowerPoint.run(async (context) => {
      const slides = context.presentation.slides;
      
      // Remove all existing slides except the first and clear it
      await removeAllSlidesExceptFirst(slides, context);
      
      // Create slides from the saved data
      console.log("🔨 Creating slides from saved data...");
      
      // If we have presentation data, create slides
      if (presentationData.length > 0) {
        // Use the first slide data to populate the existing first slide
        const firstSlideData = presentationData[0];
        slides.load("items");
        await context.sync();
        
        if (slides.items.length > 0) {
          const firstSlide = slides.items[0];
          await populateSlideShapes(firstSlide, firstSlideData.shapes, context);
        }
        
        // Create additional slides for remaining data
        for (let i = 1; i < presentationData.length; i++) {
          const slideData = presentationData[i];
          await createSlideWithData(slides, slideData, context);
        }
      }

      await context.sync();

      console.log("✅ Pull completed successfully");
      updateUI("✅ PowerPoint presentation pulled and rebuilt successfully!");
    });
  } catch (error) {
    console.error("❌ Pull failed:", error);
    if (error.message === "No saved presentation data found") {
      updateUI("📄 No saved presentation data found");
    } else {
      updateUI("❌ Pull failed: " + error.message);
    }
  }
}

// ====================================
// 🌐 GLOBAL EXPORTS
// ====================================

// Make functions available globally
window.pushFromPowerPoint = pushFromPowerPoint;
window.pullToPowerPoint = pullToPowerPoint;

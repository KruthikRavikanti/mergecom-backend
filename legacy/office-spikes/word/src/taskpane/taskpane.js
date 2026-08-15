/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

/* global document, Office, Word */

Office.onReady((info) => {
  if (info.host === Office.HostType.Word) {
    document.getElementById("sideload-msg").style.display = "none";
    document.getElementById("app-body").style.display = "flex";
    document.getElementById("run").onclick = run;
  }
});

export async function run() {
  return Word.run(async (context) => {
    /**
     * Insert your Word code here
     */

    // insert a paragraph at the end of the document.
    const paragraph = context.document.body.insertParagraph("Hello World Kruthik", Word.InsertLocation.end);

    // change the paragraph color to blue.
    paragraph.font.color = "blue";

    await context.sync();
  });
}

async function pushFromWord() {
  await Word.run(async (context) => {
    const body = context.document.body;
    const ooxml = body.getOoxml(); // <-- key change
    await context.sync();

    await fetch('https://localhost:3001/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content: ooxml.value })
    });

    document.getElementById("output").innerText = "Formatted content pushed and saved locally!";
  });
}


async function pullToWord() {
  try {
    const response = await fetch('https://localhost:3001/load');
    const data = await response.json();
    const ooxmlContent = data.content;

    await Word.run(async (context) => {
      const body = context.document.body;
      body.clear();
      body.insertOoxml(ooxmlContent, Word.InsertLocation.start); // Insert formatted content
      await context.sync();
    });

    document.getElementById("output").innerText = "Formatted content pulled and inserted!";
  } catch (error) {
    console.error("Pull failed:", error);
    document.getElementById("output").innerText = "Pull failed: " + error.message;
  }
}


window.pushFromWord = pushFromWord;
window.pullToWord = pullToWord;

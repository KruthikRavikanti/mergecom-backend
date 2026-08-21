# MergeCom quick start

## Start with My Work

Sign in and open **My Work**. Use **Needs attention** for assigned reviews,
processing failures, and branch conflicts. Use **Continue working** for recent
documents and comparisons. Workspace search matches authorized project, folder, and
document metadata; it does not search file content.

The **Core workflow** checklist reflects completed server-side outcomes. It adapts to
your role, so viewers and reviewers are not shown creation actions they cannot take.
Dismiss it when it is no longer useful and reopen it from the same sidebar.

## Explore a synthetic comparison

Open **Getting started**, choose one of the Word, Excel, or PowerPoint samples, and
select **Open comparison**. Every sample is labeled `SYNTHETIC` and lives in a
tenant-local `[SAMPLE]` project. It uses normal authorization, immutable versions,
processing, comparison, rendition, and review behavior.

The inline guide moves through the deterministic summary, change rail, version
viewers, change inspector, and review controls. Use the arrow keys to move between
steps or Escape to skip. The guide never changes source versions.

## Compare your own file

1. Open or create an authorized project.
2. Create a Word, Excel, or PowerPoint document record.
3. Upload the first exact Office package or link a saved file from the matching
   Office add-in.
4. Save a second immutable version after making edits.
5. Select the two versions and open the comparison.
6. Inspect semantic changes and visual mappings. Treat deterministic structured
   changes as authoritative when rendition is unavailable or approximate.
7. Request review only when a recorded decision is needed. Approval does not modify
   either source version.

## Connect the Office add-in

Open **Office setup**, select the Office host and platform, and follow the displayed
sideload steps. The current manifests are served by the local HTTPS task-pane server.
Trust the generated development certificate, save the Office file to a supported
named location, and sign in to the same active workspace in the web app and task
pane.

Package access varies by Office host and platform. When exact capture is unavailable,
MergeCom refuses the push instead of substituting partial body content. Existing
authorized web uploads, structured comparisons, and exact downloads remain available.

## Send product feedback

Use the message button in the workspace header. MergeCom sends the rating, reason,
optional text you enter, page route, page category, and product version. It does not
attach document names or content, change values, review comments, files, screenshots,
or telemetry captures. Workspace owners and admins can inspect or export submissions
from **Administration**.

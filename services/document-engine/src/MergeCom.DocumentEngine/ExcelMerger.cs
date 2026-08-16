using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using DocumentFormat.OpenXml;
using DocumentFormat.OpenXml.Packaging;
using S = DocumentFormat.OpenXml.Spreadsheet;

namespace MergeCom.DocumentEngine;

internal sealed record ExcelMergeOutcome(
    MergeAnalysis Analysis,
    string Outcome,
    string? Strategy,
    string? FailureCode,
    IReadOnlyList<string> Warnings,
    IReadOnlyList<string> AppliedPaths,
    byte[]? CandidateBytes);

internal sealed class ExcelMerger(InspectionOptions options, OoxmlComparator comparator)
{
    private static readonly JsonSerializerOptions StableJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public ExcelMergeOutcome Merge(
        string basePath,
        string oursPath,
        string theirsPath,
        string candidatePath,
        InspectionResult baseInspection,
        InspectionResult oursInspection,
        InspectionResult theirsInspection,
        ComparisonResult oursComparison,
        ComparisonResult theirsComparison,
        MergeAnalysis initialAnalysis)
    {
        var blockers = initialAnalysis.Blockers.ToList();
        var changePaths = oursComparison.Changes
            .Concat(theirsComparison.Changes)
            .Select(change => change.Path)
            .Distinct(StringComparer.Ordinal)
            .ToHashSet(StringComparer.Ordinal);

        foreach (var item in initialAnalysis.Items.Where(item => item.Classification == "true_conflict"))
        {
            blockers.Add(new(
                "incompatible_target_changes",
                item.Category,
                item.Path,
                "Both versions changed the same semantic target incompatibly."));
        }

        if (blockers.Count > 0)
        {
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                blockers.Any(blocker => blocker.Code == "incompatible_target_changes")
                    ? "excel_changes_conflict"
                    : "excel_package_change_unsupported",
                ["Automatic merge stopped because the analysis contains workbook or semantic blockers."]);
        }

        if (changePaths.Count == 0
            || !MergeableChanges(oursComparison.Changes)
            || !MergeableChanges(theirsComparison.Changes))
        {
            blockers.Add(new(
                "unsupported_excel_change",
                "unknown",
                null,
                "Automatic merge accepts modified values in existing Excel cells only."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                "excel_change_unsupported",
                ["At least one Excel edit is outside the existing-cell value allowlist."]);
        }

        if (!SupportingPartsEqual(basePath, oursPath, theirsPath))
        {
            blockers.Add(new(
                "excel_relationship_integrity_unproven",
                "relationships",
                null,
                "A package part other than worksheet XML changed, so workbook integrity cannot be proven."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                "excel_supporting_parts_changed",
                ["Workbook relationships, styles, strings, names, calculations, and other supporting parts must remain byte-identical."]);
        }

        using var baseDocument = OpenSpreadsheet(basePath, false);
        using var oursDocument = OpenSpreadsheet(oursPath, false);
        using var theirsDocument = OpenSpreadsheet(theirsPath, false);
        var baseCells = CellMap(baseDocument);
        var oursCells = CellMap(oursDocument);
        var theirsCells = CellMap(theirsDocument);
        if (!StableCellIdentity(baseCells, oursCells, theirsCells))
        {
            blockers.Add(new(
                "ambiguous_cell_identity",
                "cell",
                null,
                "Worksheet order, cell order, or stable cell references differ between the inputs."));
            var items = initialAnalysis.Items
                .Select(item => changePaths.Contains(item.Path)
                    ? item with
                    {
                        Classification = "ambiguous",
                        Confidence = "low",
                        Explanation = "This cell could not be matched with high confidence across all three inputs.",
                    }
                    : item)
                .ToArray();
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, items, blockers),
                "excel_cell_match_ambiguous",
                ["Automatic merge requires stable worksheets and existing cell references."]);
        }

        foreach (var path in changePaths.Order(StringComparer.Ordinal))
        {
            if (!baseCells.TryGetValue(path, out var before)
                || !oursCells.TryGetValue(path, out var ours)
                || !theirsCells.TryGetValue(path, out var theirs)
                || !ChangedCellIsLiteralValueOnly(before.Cell, ours.Cell)
                || !ChangedCellIsLiteralValueOnly(before.Cell, theirs.Cell))
            {
                blockers.Add(new(
                    "excel_cell_markup_unsupported",
                    "cell",
                    path,
                    "A changed cell altered a formula, style, type, structure, or non-value markup."));
            }
        }

        if (!WorksheetSkeletonsEqual(baseDocument, oursDocument, theirsDocument, changePaths))
        {
            blockers.Add(new(
                "excel_worksheet_structure_changed",
                "worksheet",
                null,
                "Worksheet XML differs outside the approved cell value nodes."));
        }

        if (blockers.Count > 0)
        {
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                blockers.Any(blocker => blocker.Code == "excel_worksheet_structure_changed")
                    ? "excel_worksheet_structure_changed"
                    : "excel_cell_markup_unsupported",
                ["Changed Excel cells must remain non-formula literals with identical type, style, and worksheet structure."]);
        }

        var oursPaths = oursComparison.Changes.Select(change => change.Path).ToHashSet(StringComparer.Ordinal);
        var theirsPaths = theirsComparison.Changes.Select(change => change.Path).ToHashSet(StringComparer.Ordinal);
        var overlappingPaths = oursPaths.Intersect(theirsPaths, StringComparer.Ordinal).ToArray();
        if (overlappingPaths.Any(path => oursCells[path].Cell.OuterXml != theirsCells[path].Cell.OuterXml))
        {
            foreach (var path in overlappingPaths)
            {
                blockers.Add(new(
                    "incompatible_cell_value",
                    "cell",
                    path,
                    "Both versions changed the same cell value differently."));
            }
            return Manual(
                MergeAnalysisBuilder.WithDecision(initialAnalysis, false, blockers: blockers),
                "excel_changes_conflict",
                ["Both versions changed at least one of the same Excel cells incompatibly."]);
        }

        var eligibleItems = initialAnalysis.Items
            .Select(item => changePaths.Contains(item.Path)
                ? item with
                {
                    Category = "cell",
                    Confidence = "high",
                    Explanation = item.Classification == "compatible_overlap"
                        ? "Both versions made the same value-only change to a stable cell."
                        : "Only one version changed this stable cell value; workbook structure and supporting parts remain unchanged.",
                    AutomaticallyResolved = false,
                }
                : item)
            .ToArray();
        var analysis = MergeAnalysisBuilder.WithDecision(initialAnalysis, true, eligibleItems, blockers);
        if (!analysis.AutomaticMergeEnabled)
        {
            return Manual(
                analysis,
                "excel_automatic_merge_disabled",
                ["The changes are eligible, but Excel automatic merge is disabled for this organization."]);
        }

        var appliedPaths = theirsPaths.Except(oursPaths, StringComparer.Ordinal).Order(StringComparer.Ordinal).ToArray();
        File.Copy(oursPath, candidatePath, false);
        using (var candidateDocument = OpenSpreadsheet(candidatePath, true))
        {
            var candidateCells = CellMap(candidateDocument);
            foreach (var path in appliedPaths)
            {
                if (!candidateCells.TryGetValue(path, out var candidateCell)
                    || !theirsCells.TryGetValue(path, out var theirsCell))
                {
                    return Manual(
                        analysis,
                        "excel_candidate_path_missing",
                        ["An approved Excel cell could not be located in the candidate."]);
                }

                candidateCell.Cell.InsertAfterSelf(theirsCell.Cell.CloneNode(true));
                candidateCell.Cell.Remove();
                (candidateCell.WorksheetPart.Worksheet
                    ?? throw new InvalidDataException("The candidate worksheet XML is missing."))
                    .Save();
            }
        }

        var candidateBytes = File.ReadAllBytes(candidatePath);
        var inspector = new OoxmlInspector(options);
        var candidateInspection = inspector.Inspect(
            candidatePath,
            "spreadsheet",
            Convert.ToHexStringLower(SHA256.HashData(candidateBytes)));
        if (candidateInspection.Outcome != "completed"
            || candidateInspection.Snapshot.UnsupportedFeatures.Count > 0
            || candidateInspection.Snapshot.ValidationErrors.Count > 0)
        {
            blockers.Add(new(
                "candidate_workbook_validation_failed",
                "relationships",
                null,
                "The generated workbook failed bounded inspection or Open XML validation."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(analysis, false, blockers: blockers),
                "excel_candidate_validation_failed",
                ["The generated candidate was discarded after workbook validation failed."]);
        }

        var mutableWorksheets = appliedPaths
            .Select(path => oursCells[path].WorksheetPart.Uri.ToString().TrimStart('/'))
            .ToHashSet(StringComparer.Ordinal);
        if (!UntouchedPartsEqual(oursPath, candidatePath, mutableWorksheets))
        {
            blockers.Add(new(
                "candidate_byte_preservation_failed",
                "relationships",
                null,
                "A package part outside the approved worksheet set changed while generating the candidate."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(analysis, false, blockers: blockers),
                "excel_candidate_preservation_failed",
                ["The generated candidate was discarded because an untouched package part changed."]);
        }

        var candidateComparison = comparator.Compare(baseInspection.Snapshot, candidateInspection.Snapshot);
        var expectedChanges = oursComparison.Changes
            .Concat(theirsComparison.Changes)
            .GroupBy(change => change.Path, StringComparer.Ordinal)
            .Select(group => group.Last())
            .Select(ChangeSignature)
            .Order(StringComparer.Ordinal)
            .ToArray();
        var actualChanges = candidateComparison.Changes
            .Select(ChangeSignature)
            .Order(StringComparer.Ordinal)
            .ToArray();
        if (!expectedChanges.SequenceEqual(actualChanges, StringComparer.Ordinal))
        {
            blockers.Add(new(
                "candidate_semantic_union_failed",
                "cell",
                null,
                "The generated workbook did not reproduce the exact union of both semantic change sets."));
            return Manual(
                MergeAnalysisBuilder.WithDecision(analysis, false, blockers: blockers),
                "excel_candidate_verification_failed",
                ["The generated candidate was discarded after semantic-union verification failed."]);
        }

        var oursWorksheets = oursPaths.Select(path => oursCells[path].WorksheetPart.Uri.ToString()).ToHashSet(StringComparer.Ordinal);
        var theirsWorksheets = theirsPaths.Select(path => theirsCells[path].WorksheetPart.Uri.ToString()).ToHashSet(StringComparer.Ordinal);
        analysis = MergeAnalysisBuilder.WithDecision(
            analysis,
            true,
            analysis.Items.Select(item => changePaths.Contains(item.Path)
                ? item with { AutomaticallyResolved = true }
                : item).ToArray());
        return new(
            analysis,
            "completed",
            oursWorksheets.Overlaps(theirsWorksheets)
                ? "disjoint_excel_cells"
                : "disjoint_excel_worksheets",
            null,
            [],
            appliedPaths,
            candidateBytes);
    }

    private static ExcelMergeOutcome Manual(
        MergeAnalysis analysis,
        string failureCode,
        IReadOnlyList<string> warnings)
        => new(analysis, "manual_resolution_required", null, failureCode, warnings, [], null);

    private SpreadsheetDocument OpenSpreadsheet(string path, bool editable)
        => SpreadsheetDocument.Open(path, editable, new OpenSettings
        {
            AutoSave = false,
            MaxCharactersInPart = options.MaxXmlCharacters,
        });

    private static bool MergeableChanges(IReadOnlyList<ComparisonChange> changes)
        => changes.Count > 0 && changes.All(change =>
            change.ChangeType == "modified"
            && change.Category == "content"
            && change.EntityType == "worksheet_cell"
            && change.Path.StartsWith("/workbook/sheets/", StringComparison.Ordinal));

    private static bool ChangedCellIsLiteralValueOnly(S.Cell before, S.Cell after)
    {
        if (before.CellFormula is not null
            || after.CellFormula is not null
            || before.DataType?.Value == S.CellValues.SharedString
            || after.DataType?.Value == S.CellValues.SharedString
            || before.DataType?.Value == S.CellValues.Error
            || after.DataType?.Value == S.CellValues.Error)
        {
            return false;
        }

        var beforeValues = before.Descendants<S.CellValue>().Count() + before.Descendants<S.Text>().Count();
        var afterValues = after.Descendants<S.CellValue>().Count() + after.Descendants<S.Text>().Count();
        return beforeValues > 0
            && beforeValues == afterValues
            && ValuelessMarkup(before) == ValuelessMarkup(after);
    }

    private static string ValuelessMarkup(S.Cell cell)
    {
        var clone = (S.Cell)cell.CloneNode(true);
        foreach (var value in clone.Descendants<S.CellValue>()) value.Text = string.Empty;
        foreach (var text in clone.Descendants<S.Text>()) text.Text = string.Empty;
        return clone.OuterXml;
    }

    private static IReadOnlyDictionary<string, CellReference> CellMap(SpreadsheetDocument document)
    {
        var workbookPart = document.WorkbookPart
            ?? throw new InvalidDataException("The workbook main part is missing.");
        var sheets = workbookPart.Workbook?.Sheets?.Elements<S.Sheet>().ToArray() ?? [];
        var result = new Dictionary<string, CellReference>(StringComparer.Ordinal);
        for (var sheetIndex = 0; sheetIndex < sheets.Length; sheetIndex++)
        {
            var sheet = sheets[sheetIndex];
            var relationshipId = sheet.Id?.Value
                ?? throw new InvalidDataException("A worksheet relationship is missing.");
            if (workbookPart.GetPartById(relationshipId) is not WorksheetPart worksheetPart)
            {
                throw new InvalidDataException("A worksheet relationship does not resolve.");
            }
            var sheetIdentity = sheet.SheetId?.Value.ToString(
                System.Globalization.CultureInfo.InvariantCulture) ?? relationshipId;
            var cells = worksheetPart.Worksheet?.Descendants<S.Cell>().ToArray() ?? [];
            for (var cellIndex = 0; cellIndex < cells.Length; cellIndex++)
            {
                var reference = cells[cellIndex].CellReference?.Value;
                if (string.IsNullOrWhiteSpace(reference))
                {
                    throw new InvalidDataException("An Excel cell has no stable reference.");
                }
                var path = $"/workbook/sheets/{sheetIdentity}/cells/{reference}";
                if (!result.TryAdd(path, new(sheetIndex + 1, cellIndex + 1, worksheetPart, cells[cellIndex])))
                {
                    throw new InvalidDataException("An Excel cell reference is duplicated.");
                }
            }
        }
        return result;
    }

    private static bool StableCellIdentity(params IReadOnlyDictionary<string, CellReference>[] maps)
        => maps.Skip(1).All(map =>
            maps[0].Count == map.Count
            && maps[0].All(item =>
                map.TryGetValue(item.Key, out var other)
                && item.Value.SheetPosition == other.SheetPosition
                && item.Value.CellPosition == other.CellPosition));

    private static bool WorksheetSkeletonsEqual(
        SpreadsheetDocument basis,
        SpreadsheetDocument ours,
        SpreadsheetDocument theirs,
        IReadOnlySet<string> changePaths)
    {
        var inventories = new[] { basis, ours, theirs }
            .Select(document => WorksheetSkeletons(document, changePaths))
            .ToArray();
        return inventories.Skip(1).All(inventory =>
            inventories[0].Count == inventory.Count
            && inventories[0].All(item =>
                inventory.TryGetValue(item.Key, out var xml) && xml == item.Value));
    }

    private static IReadOnlyDictionary<string, string> WorksheetSkeletons(
        SpreadsheetDocument document,
        IReadOnlySet<string> changePaths)
    {
        var cells = CellMap(document);
        var result = new Dictionary<string, string>(StringComparer.Ordinal);
        foreach (var worksheetPart in document.WorkbookPart!.WorksheetParts)
        {
            var clone = (S.Worksheet)(worksheetPart.Worksheet
                ?? throw new InvalidDataException("A worksheet XML root is missing."))
                .CloneNode(true);
            foreach (var path in changePaths)
            {
                if (!cells.TryGetValue(path, out var cell)
                    || cell.WorksheetPart.Uri != worksheetPart.Uri)
                {
                    continue;
                }
                var reference = cell.Cell.CellReference?.Value;
                var cloneCell = clone.Descendants<S.Cell>()
                    .Single(item => item.CellReference?.Value == reference);
                foreach (var value in cloneCell.Descendants<S.CellValue>()) value.Text = string.Empty;
                foreach (var text in cloneCell.Descendants<S.Text>()) text.Text = string.Empty;
            }
            result.Add(worksheetPart.Uri.ToString(), clone.OuterXml);
        }
        return result;
    }

    private static bool SupportingPartsEqual(params string[] packagePaths)
    {
        var inventories = packagePaths.Select(PackageInventory).ToArray();
        return inventories.Skip(1).All(inventory =>
            inventories[0].Count == inventory.Count
            && inventories[0].All(item =>
                inventory.TryGetValue(item.Key, out var hash) && hash == item.Value));
    }

    private static bool UntouchedPartsEqual(
        string oursPath,
        string candidatePath,
        IReadOnlySet<string> mutableWorksheets)
    {
        var ours = FullPackageInventory(oursPath);
        var candidate = FullPackageInventory(candidatePath);
        return ours.Count == candidate.Count
            && ours.All(item =>
                candidate.TryGetValue(item.Key, out var hash)
                && (mutableWorksheets.Contains(item.Key) || hash == item.Value));
    }

    private static IReadOnlyDictionary<string, string> PackageInventory(string packagePath)
        => FullPackageInventory(packagePath)
            .Where(item => !IsWorksheetXml(item.Key))
            .ToDictionary(item => item.Key, item => item.Value, StringComparer.Ordinal);

    private static IReadOnlyDictionary<string, string> FullPackageInventory(string packagePath)
    {
        using var archive = ZipFile.OpenRead(packagePath);
        return archive.Entries
            .Where(entry => !entry.FullName.EndsWith("/", StringComparison.Ordinal))
            .ToDictionary(
                entry => entry.FullName,
                entry =>
                {
                    using var stream = entry.Open();
                    return Convert.ToHexStringLower(SHA256.HashData(stream));
                },
                StringComparer.Ordinal);
    }

    private static bool IsWorksheetXml(string part)
        => part.StartsWith("xl/worksheets/sheet", StringComparison.Ordinal)
            && part.EndsWith(".xml", StringComparison.Ordinal)
            && !part.Contains("/_rels/", StringComparison.Ordinal);

    private static string ChangeSignature(ComparisonChange change)
        => JsonSerializer.Serialize(new
        {
            change.ChangeType,
            change.Category,
            change.EntityType,
            change.Path,
            change.Before,
            change.After,
        }, StableJsonOptions);

    private sealed record CellReference(
        int SheetPosition,
        int CellPosition,
        WorksheetPart WorksheetPart,
        S.Cell Cell);
}

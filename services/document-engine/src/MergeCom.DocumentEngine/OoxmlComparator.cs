using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MergeCom.DocumentEngine;

public sealed class OoxmlComparator
{
    public const string ComparisonSchemaVersion = "1.0.0";
    public const string EngineVersion = "1.0.0";

    private static readonly JsonSerializerOptions StableJsonOptions = new()
    {
        PropertyNameCaseInsensitive = true,
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public ComparisonResult Compare(SnapshotEnvelope baseSnapshot, SnapshotEnvelope targetSnapshot)
    {
        ValidateSnapshot(baseSnapshot);
        ValidateSnapshot(targetSnapshot);
        if (!string.Equals(baseSnapshot.FileType, targetSnapshot.FileType, StringComparison.Ordinal))
        {
            throw new InvalidComparisonException(
                "file_type_mismatch",
                "Comparison snapshots must have the same Office document type.");
        }

        var baseEntities = Entities(baseSnapshot);
        var targetEntities = Entities(targetSnapshot);
        var changes = Diff(baseEntities, targetEntities)
            .Concat(DiffUnsupported(baseSnapshot, targetSnapshot))
            .Concat(DiffValidation(baseSnapshot, targetSnapshot))
            .OrderBy(change => change.Category, StringComparer.Ordinal)
            .ThenBy(change => change.Path, StringComparer.Ordinal)
            .ThenBy(change => change.ChangeType, StringComparer.Ordinal)
            .ThenBy(change => change.Id, StringComparer.Ordinal)
            .ToArray();
        var warnings = Warnings(baseSnapshot, targetSnapshot);
        var complete = warnings.Count == 0;
        var summary = Summary(changes);
        var byteEqual = string.Equals(
            baseSnapshot.SourceSha256,
            targetSnapshot.SourceSha256,
            StringComparison.Ordinal);
        bool? semanticEqual = changes.Length > 0
            ? false
            : complete
                ? true
                : null;
        var basis = new StableComparisonBasis(
            ComparisonSchemaVersion,
            OoxmlInspector.ParserVersion,
            EngineVersion,
            baseSnapshot.SourceSha256,
            targetSnapshot.SourceSha256,
            baseSnapshot.FileType,
            byteEqual,
            semanticEqual,
            complete ? "complete" : "partial",
            summary,
            warnings,
            changes);
        var stableHash = Hash(JsonSerializer.SerializeToUtf8Bytes(basis, StableJsonOptions));
        return new(
            basis.ComparisonSchemaVersion,
            basis.ParserVersion,
            basis.EngineVersion,
            basis.BaseSourceSha256,
            basis.TargetSourceSha256,
            basis.FileType,
            basis.ByteEqual,
            basis.SemanticEqual,
            basis.Completeness,
            basis.Summary,
            basis.Warnings,
            basis.Changes,
            stableHash);
    }

    private static IReadOnlyList<SemanticEntity> Entities(SnapshotEnvelope snapshot)
    {
        var entities = PackageEntities(snapshot.Package).ToList();
        switch (snapshot.FileType)
        {
            case "presentation":
                AddPresentationEntities(entities, Payload<PresentationInventory>(snapshot));
                break;
            case "spreadsheet":
                AddSpreadsheetEntities(entities, Payload<SpreadsheetInventory>(snapshot));
                break;
            case "word_document":
                AddWordEntities(entities, Payload<WordInventory>(snapshot));
                break;
            default:
                throw new InvalidComparisonException(
                    "file_type_unsupported",
                    "The comparison file type is unsupported.");
        }

        return entities;
    }

    private static IEnumerable<SemanticEntity> PackageEntities(PackageSummary package)
    {
        yield return Feature("macros", "Macros", package.HasMacros);
        yield return Feature("digital-signatures", "Digital signatures", package.HasDigitalSignatures);
        yield return Feature("external-links", "External links", package.HasExternalLinks);
        yield return Feature("embedded-objects", "Embedded objects", package.HasEmbeddedObjects);
    }

    private static SemanticEntity Feature(string key, string label, bool present) => new(
        $"package-feature:{key}",
        0,
        "package_feature",
        label,
        $"/package/features/{key}",
        "feature",
        "high",
        present ? "present" : "absent",
        present ? "Present" : "Absent");

    private static void AddPresentationEntities(
        ICollection<SemanticEntity> entities,
        PresentationInventory inventory)
    {
        foreach (var slide in inventory.Slides)
        {
            var slideKey = $"slide:{slide.Part}";
            entities.Add(new(
                slideKey,
                slide.Position,
                "slide",
                $"Slide {slide.Position}",
                $"/presentation/slides/{slide.Part.TrimStart('/')}",
                "structure",
                "high",
                JsonSerializer.Serialize(new
                {
                    slide.HasNotes,
                    slide.LayoutPart,
                    slide.MasterPart,
                    slide.RelationshipCount,
                }, StableJsonOptions),
                slide.HasNotes ? "Includes speaker notes" : "No speaker notes"));
            foreach (var shape in slide.Shapes)
            {
                var label = string.IsNullOrWhiteSpace(shape.Name)
                    ? $"Shape {shape.Id}"
                    : shape.Name;
                entities.Add(new(
                    $"{slideKey}:shape:{shape.Id}",
                    shape.Position,
                    "slide_shape",
                    label,
                    $"/presentation/slides/{slide.Part.TrimStart('/')}/shapes/{shape.Id}",
                    "content",
                    "medium",
                    $"{shape.Kind}\n{shape.Name}\n{shape.Text}\n{shape.MarkupHash}\n{shape.AssetHash}",
                    shape.Text.Length > 0 ? shape.Text : $"{shape.Kind} visual"));
            }
        }
    }

    private static void AddSpreadsheetEntities(
        ICollection<SemanticEntity> entities,
        SpreadsheetInventory inventory)
    {
        foreach (var sheet in inventory.Sheets)
        {
            var sheetIdentity = sheet.SheetId?.ToString(
                System.Globalization.CultureInfo.InvariantCulture)
                ?? sheet.RelationshipId;
            var sheetKey = $"sheet:{sheetIdentity}";
            entities.Add(new(
                sheetKey,
                sheet.Position,
                "worksheet",
                sheet.Name,
                $"/workbook/sheets/{sheetIdentity}",
                "structure",
                "high",
                $"{sheet.Name}\n{sheet.Visibility}\n{sheet.Dimension}\n{sheet.TableCount}\n{sheet.ChartCount}\n{sheet.HasDrawings}",
                $"{sheet.Name} ({sheet.Visibility})"));
            foreach (var cell in sheet.Cells)
            {
                var display = cell.Formula is null
                    ? cell.Value
                    : $"={cell.Formula} -> {cell.Value}";
                entities.Add(new(
                    $"{sheetKey}:cell:{cell.Reference}",
                    0,
                    "worksheet_cell",
                    $"{sheet.Name}!{cell.Reference}",
                    $"/workbook/sheets/{sheetIdentity}/cells/{cell.Reference}",
                    "content",
                    "medium",
                    $"{cell.DataType}\n{cell.StyleIndex}\n{cell.Formula}\n{cell.Value}",
                    display));
            }
        }

        foreach (var name in inventory.DefinedNames)
        {
            entities.Add(new(
                $"defined-name:{name.LocalSheetId}:{name.Name}",
                0,
                "defined_name",
                name.Name,
                $"/workbook/defined-names/{name.LocalSheetId}/{name.Name}",
                "structure",
                "medium",
                name.Formula,
                name.Formula));
        }
    }

    private static void AddWordEntities(
        ICollection<SemanticEntity> entities,
        WordInventory inventory)
    {
        entities.Add(new(
            "word-document-structure",
            0,
            "word_document_structure",
            "Document structure",
            "/body",
            "structure",
            "high",
            $"{inventory.SectionCount}\n{inventory.ParagraphCount}\n{inventory.HeadingCount}\n{inventory.TableCount}\n{inventory.HeaderCount}\n{inventory.FooterCount}\n{inventory.FootnoteCount}\n{inventory.EndnoteCount}\n{inventory.CommentCount}\n{inventory.ImageCount}\n{inventory.TrackedChangeCount}",
            $"{inventory.ParagraphCount} paragraphs / {inventory.TableCount} tables"));
        foreach (var block in inventory.Blocks)
        {
            entities.Add(new(
                $"word-block:{block.Path}",
                0,
                block.Kind,
                block.Kind == "table_cell" ? "Table cell" : "Paragraph",
                block.Path,
                "content",
                "medium",
                $"{block.Style}\n{block.Text}\n{block.MarkupHash}",
                block.Text));
        }
    }

    private static IEnumerable<ComparisonChange> Diff(
        IReadOnlyList<SemanticEntity> baseEntities,
        IReadOnlyList<SemanticEntity> targetEntities)
    {
        var before = IndexEntities(baseEntities);
        var after = IndexEntities(targetEntities);
        foreach (var key in before.Keys.Union(after.Keys, StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            var hasBefore = before.TryGetValue(key, out var baseEntity);
            var hasAfter = after.TryGetValue(key, out var targetEntity);
            if (!hasBefore)
            {
                yield return Change("added", targetEntity!, null, targetEntity!.Display);
                continue;
            }

            if (!hasAfter)
            {
                yield return Change("removed", baseEntity!, baseEntity!.Display, null);
                continue;
            }

            if (!string.Equals(baseEntity!.Fingerprint, targetEntity!.Fingerprint, StringComparison.Ordinal))
            {
                yield return Change("modified", targetEntity, baseEntity.Display, targetEntity.Display);
            }

            if (baseEntity.Position != targetEntity.Position
                && baseEntity.Position > 0
                && targetEntity.Position > 0)
            {
                yield return Change(
                    "moved",
                    targetEntity,
                    baseEntity.Position.ToString(System.Globalization.CultureInfo.InvariantCulture),
                    targetEntity.Position.ToString(System.Globalization.CultureInfo.InvariantCulture));
            }
        }
    }

    private static IReadOnlyDictionary<string, SemanticEntity> IndexEntities(
        IReadOnlyList<SemanticEntity> entities)
    {
        var indexed = new Dictionary<string, SemanticEntity>(StringComparer.Ordinal);
        foreach (var group in entities.GroupBy(entity => entity.Key, StringComparer.Ordinal))
        {
            var ordered = group
                .OrderBy(entity => entity.Position)
                .ThenBy(entity => entity.Path, StringComparer.Ordinal)
                .ThenBy(entity => entity.Fingerprint, StringComparer.Ordinal)
                .ToArray();
            for (var index = 0; index < ordered.Length; index++)
            {
                var key = ordered.Length == 1
                    ? group.Key
                    : $"{group.Key}:occurrence:{index + 1}";
                indexed[key] = ordered[index];
            }
        }

        return indexed;
    }

    private static IEnumerable<ComparisonChange> DiffUnsupported(
        SnapshotEnvelope baseSnapshot,
        SnapshotEnvelope targetSnapshot)
    {
        var before = baseSnapshot.UnsupportedFeatures.ToHashSet(StringComparer.Ordinal);
        var after = targetSnapshot.UnsupportedFeatures.ToHashSet(StringComparer.Ordinal);
        foreach (var feature in before.Union(after).Order(StringComparer.Ordinal))
        {
            if (before.Contains(feature) == after.Contains(feature))
            {
                continue;
            }

            var entity = new SemanticEntity(
                $"unsupported:{feature}",
                0,
                "unsupported_feature",
                Humanize(feature),
                $"/unsupported-features/{feature}",
                "feature",
                "high",
                feature,
                "Detected");
            yield return before.Contains(feature)
                ? Change("removed", entity, "Detected", null)
                : Change("added", entity, null, "Detected");
        }
    }

    private static IEnumerable<ComparisonChange> DiffValidation(
        SnapshotEnvelope baseSnapshot,
        SnapshotEnvelope targetSnapshot)
    {
        static string Key(ValidationIssue issue) => $"{issue.Code}|{issue.Part}|{issue.Path}";
        var before = baseSnapshot.ValidationErrors
            .GroupBy(Key, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.OrderBy(issue => issue.Description, StringComparer.Ordinal).First(),
                StringComparer.Ordinal);
        var after = targetSnapshot.ValidationErrors
            .GroupBy(Key, StringComparer.Ordinal)
            .ToDictionary(
                group => group.Key,
                group => group.OrderBy(issue => issue.Description, StringComparer.Ordinal).First(),
                StringComparer.Ordinal);
        foreach (var key in before.Keys.Union(after.Keys, StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            var hadIssue = before.TryGetValue(key, out var baseIssue);
            var hasIssue = after.TryGetValue(key, out var targetIssue);
            if (hadIssue == hasIssue)
            {
                continue;
            }

            var issue = targetIssue ?? baseIssue!;
            var entity = new SemanticEntity(
                $"validation:{key}",
                0,
                "validation_issue",
                issue.Code,
                issue.Path ?? issue.Part ?? "/validation",
                "validation",
                "high",
                issue.Description,
                issue.Description);
            yield return hadIssue
                ? Change("removed", entity, issue.Description, null)
                : Change("added", entity, null, issue.Description);
        }
    }

    private static ComparisonChange Change(
        string changeType,
        SemanticEntity entity,
        string? before,
        string? after)
    {
        var idBasis = string.Join('\n',
            changeType,
            entity.Category,
            entity.EntityType,
            entity.Path,
            before,
            after);
        return new(
            Hash(Encoding.UTF8.GetBytes(idBasis)),
            changeType,
            entity.Category,
            entity.Impact,
            entity.EntityType,
            entity.Label,
            entity.Path,
            before,
            after);
    }

    private static IReadOnlyList<string> Warnings(
        SnapshotEnvelope baseSnapshot,
        SnapshotEnvelope targetSnapshot)
    {
        var warnings = new List<string>();
        foreach (var feature in baseSnapshot.UnsupportedFeatures.Order(StringComparer.Ordinal))
        {
            warnings.Add($"Base version contains unsupported feature: {feature}.");
        }

        foreach (var feature in targetSnapshot.UnsupportedFeatures.Order(StringComparer.Ordinal))
        {
            warnings.Add($"Target version contains unsupported feature: {feature}.");
        }

        if (baseSnapshot.ValidationErrors.Count > 0)
        {
            warnings.Add($"Base version has {baseSnapshot.ValidationErrors.Count} Open XML validation issue(s).");
        }

        if (targetSnapshot.ValidationErrors.Count > 0)
        {
            warnings.Add($"Target version has {targetSnapshot.ValidationErrors.Count} Open XML validation issue(s).");
        }

        return warnings.Distinct(StringComparer.Ordinal).ToArray();
    }

    private static IReadOnlyDictionary<string, int> Summary(IReadOnlyList<ComparisonChange> changes)
        => new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["total"] = changes.Count,
            ["added"] = changes.Count(change => change.ChangeType == "added"),
            ["modified"] = changes.Count(change => change.ChangeType == "modified"),
            ["moved"] = changes.Count(change => change.ChangeType == "moved"),
            ["removed"] = changes.Count(change => change.ChangeType == "removed"),
            ["content"] = changes.Count(change => change.Category == "content"),
            ["feature"] = changes.Count(change => change.Category == "feature"),
            ["structure"] = changes.Count(change => change.Category == "structure"),
            ["validation"] = changes.Count(change => change.Category == "validation"),
        };

    private static T Payload<T>(SnapshotEnvelope snapshot)
    {
        try
        {
            if (snapshot.FormatPayload is JsonElement element)
            {
                return element.Deserialize<T>(StableJsonOptions)
                    ?? throw new JsonException("Snapshot format payload is empty.");
            }

            var serialized = JsonSerializer.SerializeToElement(snapshot.FormatPayload, StableJsonOptions);
            return serialized.Deserialize<T>(StableJsonOptions)
                ?? throw new JsonException("Snapshot format payload is empty.");
        }
        catch (JsonException exception)
        {
            throw new InvalidComparisonException(
                "snapshot_payload_invalid",
                $"A normalized snapshot payload is invalid: {exception.Message}");
        }
    }

    private static void ValidateSnapshot(SnapshotEnvelope snapshot)
    {
        if (!string.Equals(snapshot.SchemaVersion, OoxmlInspector.SchemaVersion, StringComparison.Ordinal)
            || !string.Equals(snapshot.ParserVersion, OoxmlInspector.ParserVersion, StringComparison.Ordinal))
        {
            throw new InvalidComparisonException(
                "snapshot_version_mismatch",
                "Comparison snapshots must use the current normalized schema and parser versions.");
        }

        if (snapshot.SourceSha256.Length != 64
            || snapshot.SourceSha256.Any(character => character is not (>= '0' and <= '9' or >= 'a' and <= 'f')))
        {
            throw new InvalidComparisonException(
                "snapshot_hash_invalid",
                "A comparison snapshot has an invalid source hash.");
        }
    }

    private static string Humanize(string value)
        => string.Join(' ', value.Split('_', StringSplitOptions.RemoveEmptyEntries)) switch
        {
            { Length: 0 } => value,
            var words => char.ToUpperInvariant(words[0]) + words[1..],
        };

    private static string Hash(byte[] bytes)
        => Convert.ToHexStringLower(SHA256.HashData(bytes));

    private sealed record SemanticEntity(
        string Key,
        int Position,
        string EntityType,
        string Label,
        string Path,
        string Category,
        string Impact,
        string Fingerprint,
        string Display);

    private sealed record StableComparisonBasis(
        string ComparisonSchemaVersion,
        string ParserVersion,
        string EngineVersion,
        string BaseSourceSha256,
        string TargetSourceSha256,
        string FileType,
        bool ByteEqual,
        bool? SemanticEqual,
        string Completeness,
        IReadOnlyDictionary<string, int> Summary,
        IReadOnlyList<string> Warnings,
        IReadOnlyList<ComparisonChange> Changes);
}

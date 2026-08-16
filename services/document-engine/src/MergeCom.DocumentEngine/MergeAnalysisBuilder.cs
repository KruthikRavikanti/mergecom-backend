using System.IO.Compression;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace MergeCom.DocumentEngine;

internal static class MergeAnalysisBuilder
{
    public const string AnalysisSchemaVersion = "1.0.0";

    private static readonly JsonSerializerOptions StableJsonOptions = new()
    {
        PropertyNamingPolicy = JsonNamingPolicy.SnakeCaseLower,
    };

    public static MergeAnalysis Rejected(bool automaticMergeEnabled, string explanation)
        => Create(
            automaticMergeEnabled,
            false,
            [],
            [new("merge_source_rejected", "unknown", null, explanation)]);

    public static MergeAnalysis Build(
        string fileType,
        string basePath,
        string oursPath,
        string theirsPath,
        SnapshotEnvelope baseSnapshot,
        SnapshotEnvelope oursSnapshot,
        SnapshotEnvelope theirsSnapshot,
        ComparisonResult oursComparison,
        ComparisonResult theirsComparison,
        bool automaticMergeEnabled)
    {
        var items = SemanticItems(oursComparison.Changes, theirsComparison.Changes).ToList();
        var blockers = new List<MergeAnalysisBlocker>();

        if (fileType == "presentation")
        {
            AddPresentationPackageChanges(
                basePath,
                oursPath,
                theirsPath,
                items,
                blockers);
        }

        var snapshots = new[] { baseSnapshot, oursSnapshot, theirsSnapshot };
        foreach (var feature in snapshots
                     .SelectMany(snapshot => snapshot.UnsupportedFeatures)
                     .Distinct(StringComparer.Ordinal)
                     .Order(StringComparer.Ordinal))
        {
            var category = UnsupportedCategory(feature);
            blockers.Add(new(
                $"unsupported_{feature}",
                category,
                null,
                UnsupportedExplanation(category)));
            items.Add(Item(
                "unsupported",
                category,
                "high",
                CategoryLabel(category),
                $"/package/unsupported/{feature}",
                UnsupportedExplanation(category),
                null,
                null,
                false));
        }

        foreach (var issue in snapshots
                     .SelectMany(snapshot => snapshot.ValidationErrors)
                     .GroupBy(issue => $"{issue.Code}\n{issue.Part}\n{issue.Path}", StringComparer.Ordinal)
                     .Select(group => group.First())
                     .OrderBy(issue => issue.Part, StringComparer.Ordinal)
                     .ThenBy(issue => issue.Path, StringComparer.Ordinal))
        {
            blockers.Add(new(
                "source_package_validation_failed",
                "unknown",
                issue.Part ?? issue.Path,
                "An input package failed Open XML validation."));
        }

        return Create(automaticMergeEnabled, false, items, blockers);
    }

    public static MergeAnalysis WithDecision(
        MergeAnalysis analysis,
        bool eligible,
        IReadOnlyList<MergeAnalysisItem>? items = null,
        IReadOnlyList<MergeAnalysisBlocker>? blockers = null)
        => Create(
            analysis.AutomaticMergeEnabled,
            eligible,
            items ?? analysis.Items,
            blockers ?? analysis.Blockers);

    private static MergeAnalysis Create(
        bool automaticMergeEnabled,
        bool eligible,
        IReadOnlyList<MergeAnalysisItem> items,
        IReadOnlyList<MergeAnalysisBlocker> blockers)
    {
        var orderedItems = items
            .DistinctBy(item => item.Id, StringComparer.Ordinal)
            .OrderBy(item => item.Classification, StringComparer.Ordinal)
            .ThenBy(item => item.Category, StringComparer.Ordinal)
            .ThenBy(item => item.Path, StringComparer.Ordinal)
            .ToArray();
        var orderedBlockers = blockers
            .DistinctBy(
                blocker => $"{blocker.Code}\n{blocker.Path}",
                StringComparer.Ordinal)
            .OrderBy(blocker => blocker.Category, StringComparer.Ordinal)
            .ThenBy(blocker => blocker.Path, StringComparer.Ordinal)
            .ThenBy(blocker => blocker.Code, StringComparer.Ordinal)
            .ToArray();
        var summary = new Dictionary<string, int>(StringComparer.Ordinal)
        {
            ["ambiguous"] = orderedItems.Count(item => item.Classification == "ambiguous"),
            ["compatible_overlap"] = orderedItems.Count(item => item.Classification == "compatible_overlap"),
            ["non_overlapping"] = orderedItems.Count(item => item.Classification == "non_overlapping"),
            ["true_conflict"] = orderedItems.Count(item => item.Classification == "true_conflict"),
            ["unsupported"] = orderedItems.Count(item => item.Classification == "unsupported"),
        };
        return new(
            AnalysisSchemaVersion,
            automaticMergeEnabled,
            eligible,
            summary,
            orderedItems,
            orderedBlockers);
    }

    private static IEnumerable<MergeAnalysisItem> SemanticItems(
        IReadOnlyList<ComparisonChange> oursChanges,
        IReadOnlyList<ComparisonChange> theirsChanges)
    {
        var ours = oursChanges
            .GroupBy(change => change.Path, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        var theirs = theirsChanges
            .GroupBy(change => change.Path, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.ToArray(), StringComparer.Ordinal);
        foreach (var path in ours.Keys.Concat(theirs.Keys).Distinct(StringComparer.Ordinal).Order(StringComparer.Ordinal))
        {
            ours.TryGetValue(path, out var oursAtPath);
            theirs.TryGetValue(path, out var theirsAtPath);
            var oursChange = oursAtPath?.FirstOrDefault();
            var theirsChange = theirsAtPath?.FirstOrDefault();
            var classification = oursAtPath is null || theirsAtPath is null
                ? "non_overlapping"
                : ChangeSetsEqual(oursAtPath, theirsAtPath)
                    ? "compatible_overlap"
                    : "true_conflict";
            var reference = oursChange ?? theirsChange!;
            var category = SemanticCategory(reference);
            yield return Item(
                classification,
                category,
                reference.Impact == "high" ? "high" : "medium",
                reference.Label,
                path,
                ClassificationExplanation(classification, category),
                oursChange?.ChangeType,
                theirsChange?.ChangeType,
                false);
        }
    }

    private static bool ChangeSetsEqual(
        IReadOnlyList<ComparisonChange> left,
        IReadOnlyList<ComparisonChange> right)
        => left.Select(ChangeSignature).Order(StringComparer.Ordinal)
            .SequenceEqual(right.Select(ChangeSignature).Order(StringComparer.Ordinal), StringComparer.Ordinal);

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

    private static void AddPresentationPackageChanges(
        string basePath,
        string oursPath,
        string theirsPath,
        ICollection<MergeAnalysisItem> items,
        ICollection<MergeAnalysisBlocker> blockers)
    {
        var basis = PackageInventory(basePath);
        var ours = PackageInventory(oursPath);
        var theirs = PackageInventory(theirsPath);
        foreach (var part in basis.Keys.Concat(ours.Keys).Concat(theirs.Keys)
                     .Distinct(StringComparer.Ordinal)
                     .Order(StringComparer.Ordinal))
        {
            if (IsSlideXml(part))
            {
                continue;
            }

            basis.TryGetValue(part, out var before);
            ours.TryGetValue(part, out var oursHash);
            theirs.TryGetValue(part, out var theirsHash);
            var oursChanged = oursHash != before;
            var theirsChanged = theirsHash != before;
            if (!oursChanged && !theirsChanged)
            {
                continue;
            }

            var category = PackageCategory(part);
            var classification = oursChanged && theirsChanged
                ? oursHash == theirsHash
                    ? "compatible_overlap"
                    : "true_conflict"
                : "non_overlapping";
            var path = $"/package/parts/{part}";
            items.Add(Item(
                classification,
                category,
                category is "unknown" ? "low" : "high",
                CategoryLabel(category),
                path,
                $"The {CategoryLabel(category).ToLowerInvariant()} package part changed and is outside the automatic PowerPoint allowlist.",
                oursChanged ? ChangeKind(before, oursHash) : null,
                theirsChanged ? ChangeKind(before, theirsHash) : null,
                false));
            blockers.Add(new(
                category == "unknown" ? "unknown_package_part_changed" : $"{category}_package_part_changed",
                category,
                path,
                $"Automatic merge cannot preserve a changed {CategoryLabel(category).ToLowerInvariant()} package part."));
        }
    }

    private static Dictionary<string, string> PackageInventory(string packagePath)
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

    private static MergeAnalysisItem Item(
        string classification,
        string category,
        string confidence,
        string label,
        string path,
        string explanation,
        string? oursChange,
        string? theirsChange,
        bool automaticallyResolved)
        => new(
            Hash($"{classification}\n{category}\n{path}"),
            classification,
            category,
            confidence,
            label,
            path,
            explanation,
            oursChange,
            theirsChange,
            automaticallyResolved);

    private static string SemanticCategory(ComparisonChange change)
    {
        if (change.EntityType == "slide") return "slide";
        if (change.EntityType == "slide_shape") return "shape";
        if (change.Path.EndsWith("/macros", StringComparison.Ordinal)) return "macros";
        if (change.Path.EndsWith("/digital-signatures", StringComparison.Ordinal)) return "signatures";
        if (change.Path.EndsWith("/embedded-objects", StringComparison.Ordinal)) return "embedded_object";
        if (change.Path.EndsWith("/external-links", StringComparison.Ordinal)) return "relationships";
        return "unknown";
    }

    private static string PackageCategory(string part)
    {
        var value = part.ToLowerInvariant();
        if (value.Contains("vba") || value.EndsWith(".bin")) return "macros";
        if (value.StartsWith("_xmlsignatures/")) return "signatures";
        if (value.Contains("/embeddings/")) return "embedded_object";
        if (value.Contains("notesslide")) return "notes";
        if (value.Contains("slidemaster")) return "master";
        if (value.Contains("slidelayout")) return "layout";
        if (value.Contains("/theme/")) return "theme";
        if (value.Contains("/charts/")) return "chart";
        if (value.Contains("/media/")) return "media";
        if (value.EndsWith(".rels") || value == "[content_types].xml") return "relationships";
        if (value == "ppt/presentation.xml") return "slide";
        return "unknown";
    }

    private static string UnsupportedCategory(string feature)
    {
        if (feature.Contains("notes", StringComparison.Ordinal)) return "notes";
        if (feature.Contains("linked_visual", StringComparison.Ordinal)) return "chart";
        if (feature.Contains("macro", StringComparison.Ordinal)) return "macros";
        if (feature.Contains("signature", StringComparison.Ordinal)) return "signatures";
        if (feature.Contains("embedded", StringComparison.Ordinal)) return "embedded_object";
        if (feature.Contains("external", StringComparison.Ordinal)) return "relationships";
        return "unknown";
    }

    private static string UnsupportedExplanation(string category)
        => $"The package contains {CategoryLabel(category).ToLowerInvariant()} content outside automatic merge coverage.";

    private static string ClassificationExplanation(string classification, string category)
        => classification switch
        {
            "non_overlapping" => $"Only one version changed this {CategoryLabel(category).ToLowerInvariant()} target.",
            "compatible_overlap" => $"Both versions made the same change to this {CategoryLabel(category).ToLowerInvariant()} target.",
            _ => $"Both versions changed this {CategoryLabel(category).ToLowerInvariant()} target incompatibly.",
        };

    private static string CategoryLabel(string category)
        => category switch
        {
            "embedded_object" => "Embedded object",
            "relationships" => "Relationship",
            "signatures" => "Digital signature",
            _ => char.ToUpperInvariant(category[0]) + category[1..],
        };

    private static string ChangeKind(string? before, string? after)
        => before is null ? "added" : after is null ? "removed" : "modified";

    private static bool IsSlideXml(string part)
        => part.StartsWith("ppt/slides/slide", StringComparison.Ordinal)
            && part.EndsWith(".xml", StringComparison.Ordinal)
            && !part.Contains("/_rels/", StringComparison.Ordinal);

    private static string Hash(string value)
        => Convert.ToHexStringLower(SHA256.HashData(Encoding.UTF8.GetBytes(value)));
}

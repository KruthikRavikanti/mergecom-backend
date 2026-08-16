using System.Buffers.Binary;
using System.IO.Compression;
using System.Xml;

namespace MergeCom.DocumentEngine;

internal sealed class PackagePreflight(InspectionOptions options)
{
    private const string RelationshipsNamespace = "http://schemas.openxmlformats.org/package/2006/relationships";
    private const string ContentTypesNamespace = "http://schemas.openxmlformats.org/package/2006/content-types";

    public PackageFacts Inspect(string packagePath)
    {
        var facts = new PackageFacts();
        try
        {
            var inputBytes = new FileInfo(packagePath).Length;
            if (inputBytes > options.MaxInputBytes)
            {
                throw Quarantine("package_input_limit", "The Office package exceeds the input-size limit.");
            }

            if (HasEncryptedEntry(packagePath))
            {
                throw Quarantine("package_encrypted", "Encrypted Office packages are quarantined.");
            }

            using var archive = ZipFile.OpenRead(packagePath);
            if (archive.Entries.Count == 0)
            {
                throw Permanent("package_empty", "The Office package has no parts.");
            }

            if (archive.Entries.Count > options.MaxEntries)
            {
                throw Quarantine("package_entry_limit", "The package contains too many parts.");
            }

            facts.EntryCount = archive.Entries.Count;
            var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            var hasContentTypes = false;
            var hasRootRelationships = false;

            foreach (var entry in archive.Entries.OrderBy(item => item.FullName, StringComparer.Ordinal))
            {
                var part = ValidatePartName(entry.FullName);
                if (!names.Add(part))
                {
                    throw Quarantine("package_duplicate_part", "The package contains duplicate part names.", part);
                }

                if (entry.Length > options.MaxPartBytes)
                {
                    throw Quarantine("package_part_limit", "A package part exceeds the expanded-size limit.", part);
                }

                facts.CompressedBytes = CheckedAdd(facts.CompressedBytes, entry.CompressedLength);
                facts.ExpandedBytes = CheckedAdd(facts.ExpandedBytes, entry.Length);
                if (facts.ExpandedBytes > options.MaxExpandedBytes)
                {
                    throw Quarantine("package_expansion_limit", "The package exceeds the total expanded-size limit.");
                }

                if (entry.Length > 0)
                {
                    var ratio = entry.CompressedLength == 0
                        ? double.PositiveInfinity
                        : (double)entry.Length / entry.CompressedLength;
                    if (ratio > options.MaxCompressionRatio)
                    {
                        throw Quarantine("package_compression_ratio", "A package part has an unsafe compression ratio.", part);
                    }
                }

                DetectFeatures(facts, part);
                if (string.Equals(part, "[Content_Types].xml", StringComparison.Ordinal))
                {
                    hasContentTypes = true;
                }

                if (string.Equals(part, "_rels/.rels", StringComparison.Ordinal))
                {
                    hasRootRelationships = true;
                }

                ReadAndInspectEntry(entry, part, facts);
            }

            if (!hasContentTypes)
            {
                throw Permanent("content_types_missing", "The package is missing [Content_Types].xml.");
            }

            if (!hasRootRelationships)
            {
                throw Permanent("root_relationships_missing", "The package is missing root relationships.");
            }

            AddFeatureWarnings(facts);
            return facts;
        }
        catch (InspectionRejectedException)
        {
            throw;
        }
        catch (InvalidDataException exception)
        {
            var encrypted = exception.Message.Contains("encrypt", StringComparison.OrdinalIgnoreCase);
            throw new InspectionRejectedException(
                encrypted ? "package_encrypted" : "package_corrupt",
                encrypted ? "Encrypted Office packages are quarantined." : "The Office ZIP package is corrupt.",
                encrypted ? "quarantined" : "permanently_failed",
                innerException: exception);
        }
    }

    private static bool HasEncryptedEntry(string packagePath)
    {
        const uint endOfCentralDirectorySignature = 0x06054b50;
        const uint centralDirectoryEntrySignature = 0x02014b50;
        const int endOfCentralDirectorySize = 22;
        const int maxCommentBytes = ushort.MaxValue;
        const int centralDirectoryEntrySize = 46;

        using var stream = File.OpenRead(packagePath);
        if (stream.Length < endOfCentralDirectorySize)
        {
            return false;
        }

        var tailLength = (int)Math.Min(stream.Length, endOfCentralDirectorySize + maxCommentBytes);
        var tail = new byte[tailLength];
        stream.Position = stream.Length - tailLength;
        stream.ReadExactly(tail);

        var endIndex = -1;
        for (var index = tail.Length - endOfCentralDirectorySize; index >= 0; index--)
        {
            if (BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(index, sizeof(uint))) != endOfCentralDirectorySignature)
            {
                continue;
            }

            var commentLength = BinaryPrimitives.ReadUInt16LittleEndian(tail.AsSpan(index + 20, sizeof(ushort)));
            if (index + endOfCentralDirectorySize + commentLength == tail.Length)
            {
                endIndex = index;
                break;
            }
        }

        if (endIndex < 0)
        {
            return false;
        }

        var centralDirectorySize = BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(endIndex + 12, sizeof(uint)));
        var centralDirectoryOffset = BinaryPrimitives.ReadUInt32LittleEndian(tail.AsSpan(endIndex + 16, sizeof(uint)));
        if (centralDirectorySize == uint.MaxValue || centralDirectoryOffset == uint.MaxValue)
        {
            return false;
        }

        var directoryEnd = (long)centralDirectoryOffset + centralDirectorySize;
        if (directoryEnd > stream.Length || centralDirectoryOffset > directoryEnd)
        {
            return false;
        }

        var header = new byte[centralDirectoryEntrySize];
        stream.Position = centralDirectoryOffset;
        while (stream.Position < directoryEnd)
        {
            if (directoryEnd - stream.Position < header.Length)
            {
                return false;
            }

            stream.ReadExactly(header);
            if (BinaryPrimitives.ReadUInt32LittleEndian(header) != centralDirectoryEntrySignature)
            {
                return false;
            }

            var flags = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(8, sizeof(ushort)));
            if ((flags & 0x0001) != 0)
            {
                return true;
            }

            var nameLength = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(28, sizeof(ushort)));
            var extraLength = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(30, sizeof(ushort)));
            var commentLength = BinaryPrimitives.ReadUInt16LittleEndian(header.AsSpan(32, sizeof(ushort)));
            var variableLength = (long)nameLength + extraLength + commentLength;
            if (stream.Position + variableLength > directoryEnd)
            {
                return false;
            }

            stream.Position += variableLength;
        }

        return false;
    }

    private void ReadAndInspectEntry(ZipArchiveEntry entry, string part, PackageFacts facts)
    {
        try
        {
            using var stream = entry.Open();
            if (!IsXmlPart(part))
            {
                Drain(stream, options.MaxPartBytes);
                return;
            }

            facts.XmlPartCount++;
            using var buffer = new MemoryStream(entry.Length > int.MaxValue ? 0 : (int)entry.Length);
            CopyBounded(stream, buffer, options.MaxXmlCharacters);
            buffer.Position = 0;
            InspectXml(buffer, part, facts);
        }
        catch (InspectionRejectedException)
        {
            throw;
        }
        catch (XmlException exception)
        {
            var dtd = exception.Message.Contains("DTD", StringComparison.OrdinalIgnoreCase);
            throw new InspectionRejectedException(
                dtd ? "xml_dtd_forbidden" : "xml_malformed",
                dtd ? "DTD declarations are forbidden in Office XML parts." : "A package XML part is malformed.",
                dtd ? "quarantined" : "permanently_failed",
                part,
                exception);
        }
        catch (InvalidDataException exception)
        {
            var encrypted = exception.Message.Contains("encrypt", StringComparison.OrdinalIgnoreCase);
            throw new InspectionRejectedException(
                encrypted ? "package_encrypted" : "package_corrupt",
                encrypted ? "Encrypted Office package parts are quarantined." : "A package part cannot be decompressed.",
                encrypted ? "quarantined" : "permanently_failed",
                part,
                exception);
        }
    }

    private void InspectXml(Stream stream, string part, PackageFacts facts)
    {
        var settings = new XmlReaderSettings
        {
            DtdProcessing = DtdProcessing.Prohibit,
            IgnoreComments = true,
            IgnoreProcessingInstructions = true,
            MaxCharactersFromEntities = 0,
            MaxCharactersInDocument = options.MaxXmlCharacters,
            XmlResolver = null,
        };
        using var reader = XmlReader.Create(stream, settings);
        var rootChecked = false;
        while (reader.Read())
        {
            if (reader.Depth > options.MaxXmlDepth)
            {
                throw Quarantine("xml_depth_limit", "A package XML part exceeds the nesting-depth limit.", part);
            }

            if (reader.NodeType != XmlNodeType.Element)
            {
                continue;
            }

            if (!rootChecked)
            {
                rootChecked = true;
                ValidateSpecialRoot(reader, part);
            }

            if (part.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)
                && reader.LocalName == "Relationship"
                && reader.NamespaceURI == RelationshipsNamespace)
            {
                InspectRelationship(reader, part, facts);
            }

            if (string.Equals(part, "[Content_Types].xml", StringComparison.Ordinal)
                && reader.NamespaceURI == ContentTypesNamespace
                && reader.LocalName is "Default" or "Override")
            {
                InspectContentType(reader, part);
            }
        }
    }

    private static void InspectContentType(XmlReader reader, string part)
    {
        var contentType = reader.GetAttribute("ContentType");
        if (string.IsNullOrWhiteSpace(contentType))
        {
            throw Permanent("content_types_malformed", "A content-type declaration has no media type.", part);
        }

        if (reader.LocalName == "Override")
        {
            var partName = reader.GetAttribute("PartName");
            if (string.IsNullOrWhiteSpace(partName) || !partName.StartsWith('/'))
            {
                throw Permanent("content_types_malformed", "A content-type override has an invalid part name.", part);
            }

            _ = ValidatePartName(partName[1..]);
            return;
        }

        var extension = reader.GetAttribute("Extension");
        if (string.IsNullOrWhiteSpace(extension)
            || extension.Contains('/')
            || extension.Contains('\\')
            || extension.Contains(':'))
        {
            throw Permanent("content_types_malformed", "A default content-type extension is invalid.", part);
        }
    }

    private static void ValidateSpecialRoot(XmlReader reader, string part)
    {
        if (string.Equals(part, "[Content_Types].xml", StringComparison.Ordinal)
            && (reader.LocalName != "Types" || reader.NamespaceURI != ContentTypesNamespace))
        {
            throw Permanent("content_types_malformed", "The content-types root element is invalid.", part);
        }

        if (part.EndsWith(".rels", StringComparison.OrdinalIgnoreCase)
            && (reader.LocalName != "Relationships" || reader.NamespaceURI != RelationshipsNamespace))
        {
            throw Permanent("relationships_malformed", "A relationships root element is invalid.", part);
        }
    }

    private static void InspectRelationship(XmlReader reader, string part, PackageFacts facts)
    {
        var id = reader.GetAttribute("Id");
        var target = reader.GetAttribute("Target");
        var type = reader.GetAttribute("Type");
        if (string.IsNullOrWhiteSpace(id) || string.IsNullOrWhiteSpace(target) || string.IsNullOrWhiteSpace(type))
        {
            throw Permanent("relationships_malformed", "A relationship is missing required attributes.", part);
        }

        facts.RelationshipCount++;
        var external = string.Equals(reader.GetAttribute("TargetMode"), "External", StringComparison.OrdinalIgnoreCase);
        if (external)
        {
            if (!Uri.TryCreate(target, UriKind.Absolute, out _))
            {
                throw Permanent("external_relationship_malformed", "An external relationship target is not an absolute URI.", part);
            }

            facts.HasExternalLinks = true;
            facts.Warnings.Add(new(
                "external_relationship",
                "The package contains an external relationship that was not followed.",
                part));
            return;
        }

        ResolveInternalTarget(part, target);
    }

    private static void ResolveInternalTarget(string relationshipPart, string target)
    {
        string decoded;
        try
        {
            decoded = Uri.UnescapeDataString(target);
        }
        catch (UriFormatException exception)
        {
            throw Permanent("relationship_target_malformed", "A relationship target has invalid escaping.", relationshipPart, exception);
        }

        if (decoded.Contains('\\')
            || decoded.Contains('\0')
            || decoded.Contains('?')
            || decoded.Contains('#'))
        {
            throw Quarantine("relationship_target_unsafe", "A relationship target contains unsafe path syntax.", relationshipPart);
        }

        var source = RelationshipSource(relationshipPart);
        var sourceDirectory = source.Contains('/')
            ? source[..source.LastIndexOf('/')]
            : string.Empty;
        var combined = decoded.StartsWith('/')
            ? decoded[1..]
            : string.IsNullOrEmpty(sourceDirectory) ? decoded : $"{sourceDirectory}/{decoded}";
        var segments = new Stack<string>();
        foreach (var segment in combined.Split('/', StringSplitOptions.RemoveEmptyEntries))
        {
            if (segment == ".")
            {
                continue;
            }

            if (segment == "..")
            {
                if (!segments.TryPop(out _))
                {
                    throw Quarantine("relationship_path_traversal", "A relationship target escapes the package root.", relationshipPart);
                }

                continue;
            }

            if (segment.Contains(':', StringComparison.Ordinal))
            {
                throw Quarantine("relationship_target_unsafe", "A relationship target contains unsafe path syntax.", relationshipPart);
            }

            segments.Push(segment);
        }

        if (segments.Count == 0)
        {
            throw Permanent("relationship_target_malformed", "A relationship target resolves to no package part.", relationshipPart);
        }
    }

    private static string RelationshipSource(string relationshipPart)
    {
        if (string.Equals(relationshipPart, "_rels/.rels", StringComparison.Ordinal))
        {
            return string.Empty;
        }

        var marker = "/_rels/";
        var markerIndex = relationshipPart.LastIndexOf(marker, StringComparison.Ordinal);
        if (markerIndex < 0 || !relationshipPart.EndsWith(".rels", StringComparison.Ordinal))
        {
            throw Permanent("relationships_malformed", "A relationship part is in an invalid location.", relationshipPart);
        }

        return relationshipPart[..markerIndex] + "/" + relationshipPart[(markerIndex + marker.Length)..^5];
    }

    private static string ValidatePartName(string name)
    {
        string decoded;
        try
        {
            decoded = Uri.UnescapeDataString(name);
        }
        catch (UriFormatException exception)
        {
            throw Quarantine("package_part_name_unsafe", "A package part name has invalid escaping.", name, exception);
        }

        if (string.IsNullOrWhiteSpace(decoded)
            || decoded.StartsWith('/')
            || decoded.Contains('\0')
            || decoded.Contains('\\')
            || decoded.Split('/').Any(segment => segment is "." or ".." || segment.Contains(':', StringComparison.Ordinal)))
        {
            throw Quarantine("package_path_traversal", "A package part has an unsafe path.", name);
        }

        return decoded;
    }

    private static void DetectFeatures(PackageFacts facts, string part)
    {
        var lower = part.ToLowerInvariant();
        if (lower.EndsWith("vbaproject.bin", StringComparison.Ordinal))
        {
            facts.HasMacros = true;
        }

        if (lower.StartsWith("_xmlsignatures/", StringComparison.Ordinal)
            || lower.Contains("/_xmlsignatures/", StringComparison.Ordinal))
        {
            facts.HasDigitalSignatures = true;
        }

        if (lower.Contains("/externallinks/", StringComparison.Ordinal))
        {
            facts.HasExternalLinks = true;
        }

        if (lower.Contains("/embeddings/", StringComparison.Ordinal)
            || lower.EndsWith("oleobject.bin", StringComparison.Ordinal))
        {
            facts.HasEmbeddedObjects = true;
        }

        if (lower.EndsWith(".bin", StringComparison.Ordinal)
            && !lower.EndsWith("vbaproject.bin", StringComparison.Ordinal)
            && !lower.Contains("/printersettings/", StringComparison.Ordinal))
        {
            facts.UnsupportedFeatures.Add("binary_part");
        }
    }

    private static void AddFeatureWarnings(PackageFacts facts)
    {
        if (facts.HasMacros)
        {
            facts.Warnings.Add(new("macros_present", "The package contains VBA macros. Macros were not executed.", null));
            facts.UnsupportedFeatures.Add("vba_macros");
        }

        if (facts.HasDigitalSignatures)
        {
            facts.Warnings.Add(new("digital_signatures_present", "The package contains digital signatures. Signature trust was not evaluated.", null));
            facts.UnsupportedFeatures.Add("digital_signatures");
        }

        if (facts.HasEmbeddedObjects)
        {
            facts.Warnings.Add(new("embedded_objects_present", "The package contains embedded or OLE objects. Embedded content was not opened.", null));
            facts.UnsupportedFeatures.Add("embedded_objects");
        }

        if (facts.HasExternalLinks)
        {
            facts.UnsupportedFeatures.Add("external_links");
        }
    }

    private static bool IsXmlPart(string part) => part.EndsWith(".xml", StringComparison.OrdinalIgnoreCase)
        || part.EndsWith(".rels", StringComparison.OrdinalIgnoreCase);

    private static long CheckedAdd(long current, long value)
    {
        try
        {
            return checked(current + value);
        }
        catch (OverflowException exception)
        {
            throw Quarantine("package_expansion_limit", "Package size metadata overflowed safe limits.", inner: exception);
        }
    }

    private static void Drain(Stream source, long limit)
    {
        using var destination = Stream.Null;
        CopyBounded(source, destination, limit);
    }

    private static void CopyBounded(Stream source, Stream destination, long limit)
    {
        var buffer = new byte[64 * 1024];
        long total = 0;
        int read;
        while ((read = source.Read(buffer, 0, buffer.Length)) > 0)
        {
            total = checked(total + read);
            if (total > limit)
            {
                throw Quarantine("package_part_limit", "A package part exceeds its read limit.");
            }

            destination.Write(buffer, 0, read);
        }
    }

    private static InspectionRejectedException Quarantine(string code, string message, string? part = null, Exception? inner = null)
        => new(code, message, "quarantined", part, inner);

    private static InspectionRejectedException Permanent(string code, string message, string? part = null, Exception? inner = null)
        => new(code, message, "permanently_failed", part, inner);
}

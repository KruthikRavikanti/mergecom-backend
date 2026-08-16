# Test fixtures

Only synthetic data belongs here. Do not commit customer documents, credentials, or
production-derived data.

`office/valid-word.docx` is built only from the adjacent synthetic XML source.
Adversarial macro, signature, external-link, traversal, DTD, compression-ratio,
oversized-part, and corrupt packages are generated in the document-engine test
suite so no active content is committed.

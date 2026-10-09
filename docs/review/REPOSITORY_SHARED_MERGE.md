# Shared library merge approval

The user explicitly approved retaining Backend A commit 51ac3e5 legacy helpers and adding Backend B constant-name aliases. Both heads already use the same approved Fr modulus and v0.2 profile. The merge adds BN254_SCALAR_FIELD_ORDER = BN254_FR_SCALAR and BN254_BASE_FIELD_MODULUS = BN254_FQ_BASE. Active digest reduction, Poseidon tags, tree order and padding are unchanged. Historical v0.1 Fq mapping remains explicitly named for regression use only. This approval does not freeze other REVIEW encodings. Both owners' tests must pass before publication.

# Identity verification — teammate evaluation guide

The Aadhaar Verification screen is a local identity experience backed by the trusted **Mock IDP**, not UIDAI or Anon Aadhaar. No government response or real Aadhaar validation is performed. Use only the fictional identifiers below. Their reserved zero-prefixed namespace is deliberately unsuitable for genuine Aadhaar credentials; the backend accepts only these seven exact strings. A 12-digit shape alone is never sufficient.

| Existing Mock IDP identity | Fictional identifier | Display formatting |
| --- | --- | --- |
| RAMESH | `000000000001` | `0000 0000 0001` |
| SURESH | `000000000002` | `0000 0000 0002` |
| IMRAN | `000000000003` | `0000 0000 0003` |
| MANJUNATH | `000000000004` | `0000 0000 0004` |
| VENKATESH | `000000000005` | `0000 0000 0005` |
| FARHAN | `000000000006` | `0000 0000 0006` |
| ARJUN | `000000000007` | `0000 0000 0007` |

Connect/sign the wallet challenge, separately sign registration, complete the existing phone OTP, then submit the evaluation identifier. The server resolves the corresponding identity and issues a wallet-bound assertion; the existing onboarding verifier independently checks the trusted signature before committing the binding. Duplicate identity binding and controlled recovery retain their existing checks. Successful verification advances to financial consent; returning registered wallets still sign a fresh login challenge without repeating registration.

Submitted identifiers are transient request/form values only: they are not added to registry, worker records, assertions or history. Invalid inputs receive a fixed error and do not invoke the signer; the form clears after submission. The fixed fictional allowlist in source is test configuration, not captured user input. Do not submit any real Aadhaar number. The frontend has no UIDAI connection or government certification claim. Existing inline OTP delivery is still a Mock mailbox, not SMS.

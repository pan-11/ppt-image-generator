# Yunfei Hybrid Image Provider Design

## Goal

Add `https://img.yunfei.best` as a production image provider for three models:

- `gpt-image-2`
- `gemini-3.1-flash-image-preview` (Nano Banana 2)
- `gemini-3-pro-image-preview` (Nano Banana Pro)

The provider must support text-to-image and image-to-image jobs, preserve the existing one-output-per-job safety model, and expose only combinations that have been validated for the configured key tier.

## Scope

This change includes:

- a Yunfei-specific hybrid protocol adapter;
- 1K and 4K provider tiers;
- the three image models above in the production editor;
- text-to-image, single-reference, and multi-reference image requests;
- 16:9 output at 1K, 2K, and 4K where the selected tier permits it;
- synchronous response normalization and dimension validation;
- an eight-image live compatibility matrix after both keys are saved locally.

This change does not include:

- Veo video generation;
- `quality=high` because no high-tier key is in scope;
- automatic provider or protocol detection;
- silent fallback to another provider, model, size, or ratio;
- exposing or committing API keys.

## Why A Hybrid Adapter Is Required

The provider exposes two different image protocols under one Base URL and API key:

| Model family | Endpoint | Request format | Result format |
| --- | --- | --- | --- |
| `gpt-image-2` | `/v1/images/generations` or `/v1/images/edits` | OpenAI Images JSON or multipart | `data[].b64_json` or `data[].url` |
| Nano Banana 2 / Pro | `/v1beta/models/{model}:generateContent` | Gemini native JSON | `candidates[].content.parts[].inline_data` or `file_data` |

The adapter selects the endpoint from the requested model. This keeps one provider entry usable across all three models without duplicating the same key under two protocol types.

## Provider Settings

Add protocol type `yunfei-hybrid-images` with the display name `云飞混合图像`.

Add a required `resolutionTier` field for this protocol:

- `1K`: only 1K is exposed;
- `4K`: 1K, 2K, and 4K are exposed.

The field is persisted in the ignored local provider settings file, returned by the API as non-secret metadata, and shown only when the selected protocol requires it. Legacy providers remain valid without this field.

For this protocol, the Base URL represents the provider origin. The adapter accepts either `https://img.yunfei.best` or an input ending in `/v1`, normalizes both to the origin, and then constructs explicit `/v1/...` and `/v1beta/...` endpoints. This prevents duplicated path segments.

Two local provider entries will be created by the user after implementation:

- `云飞 1K`, using the 1K key and tier;
- `云飞 4K`, using the 4K key and tier.

Keys remain masked in API responses and are never written to documentation, source, tests, logs, or screenshots.

## Capability Resolution

Provider capabilities must depend on both the protocol and its runtime configuration. The adapter capability contract therefore receives the provider runtime configuration rather than only the generation mode.

All three models support:

- text-to-image;
- image-to-image;
- multiple reference images;
- one remote output per request;
- 16:9 output.

The editor may request multiple row outputs, but the scheduler continues to split them into independent jobs with `n=1` for every remote request.

Resolution exposure is tier-based:

| Tier | Available resolutions |
| --- | --- |
| 1K | 1K |
| 4K | 1K, 2K, 4K |

No unsupported value is silently normalized. Existing rows keep their value and show a blocking capability message until the user explicitly selects a supported combination.

Live verification is a release gate, not runtime state. If a matrix combination fails or returns the wrong dimensions during implementation, its mapping is corrected from provider evidence or removed from the adapter's capability table before delivery. No separate verification flag is stored in provider settings.

## Size Mapping

### GPT Image 2

The initial 16:9 compatibility candidates reuse the project's explicit GPT image mapping:

| UI resolution | Request `size` | Expected dimensions |
| --- | --- | --- |
| 1K | `1280x720` | 1280x720 |
| 2K | `2048x1152` | 2048x1152 |
| 4K | `3840x2160` | 3840x2160 |

These values are test candidates because the supplied Yunfei document describes the `size` field but does not publish its GPT 16:9 table. A combination is production-ready only if the live compatibility test returns the requested dimensions. Rejection or mismatch keeps that combination unavailable and requires evidence-based mapping adjustment before completion.

### Nano Banana 2 And Pro

Use the provider's documented Gemini-native 16:9 values:

| UI resolution | `imageConfig.imageSize` | Expected dimensions |
| --- | --- | --- |
| 1K | `1K` | 1376x768 |
| 2K | `2K` | 2752x1536 |
| 4K | `4K` | 5504x3072 |

Send `imageConfig.aspectRatio` as `16:9`. Do not send `auto`.

## Request Construction

### GPT Image 2 Text-To-Image

Send JSON to `/v1/images/generations` with:

- bearer authorization;
- `model: "gpt-image-2"`;
- prompt;
- mapped pixel `size`;
- `n: 1`;
- `response_format: "b64_json"`.

### GPT Image 2 Image-To-Image

Send multipart form data to `/v1/images/edits` with:

- bearer authorization;
- model, prompt, mapped size, `n=1`, and `response_format=b64_json`;
- each reference appended as a repeated `image[]` field.

The response parser also accepts repeated `image` compatibility behavior only in tests; production sends the documented `image[]` form for multiple images.

### Nano Banana Text-To-Image

Send JSON to `/v1beta/models/{model}:generateContent` with `x-goog-api-key` authentication:

```json
{
  "contents": [{
    "role": "user",
    "parts": [{ "text": "..." }]
  }],
  "generationConfig": {
    "responseModalities": ["IMAGE"],
    "imageConfig": {
      "aspectRatio": "16:9",
      "imageSize": "1K"
    }
  }
}
```

### Nano Banana Image-To-Image

Use the same endpoint and configuration. Append each reference image to `contents[0].parts` as `inline_data` containing its MIME type and base64 data. The prompt remains the first part, and reference order is preserved.

Local references are sent as inline data. The implementation does not depend on public URLs or the provider's 15-minute result URLs.

## Response Normalization

For GPT Image 2:

1. prefer `data[].b64_json`;
2. accept `data[].url` as compatibility behavior;
3. immediately download URL results because they expire after 15 minutes.

For Nano Banana models:

1. iterate every candidate and every content part;
2. return the first valid `inline_data.data` image;
3. accept `file_data.file_uri` as compatibility behavior and download it immediately;
4. never assume that the image is at part index zero.

The normalized adapter result remains an in-memory buffer plus MIME type. Existing storage and dimension validation then persist the image locally.

## Failure And Retry Semantics

Both protocol families are synchronous submissions.

- HTTP 4xx before a valid result is a failed job and is safe for an explicit user retry.
- A network timeout, disconnect, HTTP 5xx, malformed successful response, or success without an image is `unknown` because the provider may have generated or charged for the image.
- Unknown jobs are never automatically resubmitted.
- Manual retry uses the existing duplicate-charge warning.
- 429 may follow the existing bounded retry policy only when the response proves the provider rejected the request before generation; otherwise it remains unknown.

Completed sibling jobs remain untouched during retry.

## Live Compatibility Matrix

After implementation, the user saves both keys through the settings page. Before production capability is considered verified, run these eight 16:9 tests with a simple no-text product-photo prompt:

| Provider entry | Model | Resolution |
| --- | --- | --- |
| 云飞 1K | gpt-image-2 | 1K |
| 云飞 1K | Nano Banana 2 | 1K |
| 云飞 1K | Nano Banana Pro | 1K |
| 云飞 4K | gpt-image-2 | 1K |
| 云飞 4K | gpt-image-2 | 2K |
| 云飞 4K | gpt-image-2 | 4K |
| 云飞 4K | Nano Banana 2 | 1K |
| 云飞 4K | Nano Banana Pro | 1K |

Before paid generation, query `/v1/models` with each key when supported and record only model IDs. The model-list check is evidence, not a substitute for generation compatibility.

For every paid test, record:

- HTTP result;
- elapsed time;
- response form without image data;
- actual width and height;
- whether the image was saved locally;
- failure stage and sanitized error text.

Never print response base64, API keys, or authorization headers. Generated test images stay outside the repository.

## Automated Verification

Backend tests cover:

- provider settings validation and legacy normalization;
- tier-based model capabilities;
- endpoint selection by model;
- all request headers and bodies field by field;
- repeated GPT reference uploads;
- ordered Gemini inline references;
- response scanning across candidates and parts;
- base64 and short-lived URL responses;
- expected dimension mapping;
- 4xx failure versus ambiguous unknown status;
- one-output-per-job routing and retry preservation.

Frontend tests cover:

- protocol and tier fields in provider settings;
- 1K versus 4K resolution options;
- all three model labels;
- preservation and blocking of unsupported restored values;
- text/image role behavior with the new provider.

Final verification remains:

```powershell
npm test
npm run build
```

Browser smoke covers the settings page and editor at desktop and mobile widths without sending provider requests.

## Acceptance Criteria

- Both provider keys can be stored locally as separate masked entries.
- Selecting either entry exposes exactly its tier's resolutions.
- All three models route to their documented protocol.
- Text-to-image and image-to-image requests work without sending notes as prompt text.
- Reference order is preserved.
- Results are saved locally before remote URLs expire.
- Returned dimensions must match the accepted model mapping.
- The eight approved live tests complete with recorded evidence, or unsupported combinations remain disabled with a clear reason.
- No live test secret or generated artifact enters Git.

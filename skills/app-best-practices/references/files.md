# Files and uploads

Who can open what users upload, and where it is stored.

11 rules: P0 1, P1 6, P2 4, P3 0.

## P0

- Set an explicit private file visibility (USER) on every upload action for identity or personal documents; never rely on the platform default.

## P1

- No stored file URL in a private app starts with /api-endpoint/external or /auth; files uploaded from a public app carry it and 404 elsewhere.
- Keep private documents out of builder-panel uploads (Image, Lottie, PDF viewer, Avatar); they are stored public-read.
- Set file visibility explicitly on each FileUpload block; blocks nobody reopened keep the old runtime default, not the app setting.
- A maker-set upload folder path is a plain relative path: no leading slash, no .., no binding that can resolve to either.
- Give every Control Media Uploads action onErrorActions with a message; rejected files and a denied camera show no toast.
- Show anonymous visitors only PUBLIC files; USER, APPLICATION and ALL_USERS files fail to load on a public page. (web only)

## P2

- A FileUpload for documents lists explicit extensions; the Documents choice allows every application/* type and excludes csv and text.
- Guard actions in a media upload's On Success with a runCondition on the uploaded file count; cancelling the file picker can fire it.
- Set the same allowed file types and max size on every upload action for one document kind, and show an inline message when a file is refused.
- Render stored private file urls through Image, PDFViewer or a download action, not a Link url, which skips adaptation. (web only)

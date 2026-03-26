# S3 Test Artifacts snap-in — deploy to devendra4

## Prerequisites

- DevRev CLI (`devrev`)
- Valid prod profile for org `devendra4` (see auth below)

## 1. Authenticate (if you see `Token is expired`)

```bash
devrev profiles authenticate -o devendra4 -u i-devendra.gurnani@devrev.ai -e prod
```

Complete the browser flow. Or use `--link` if you prefer copying a URL manually.

## 2. Find the existing S3 Airsync snap-in (to remove it)

```bash
devrev snap_in list -o devendra4 -e prod
```

Note the **snap-in ID** (`don:integration:...:snap_in/...`) for **S3 Test Artifacts** (or the name you used previously).

## 3. Tear down the old instance

```bash
SNAP_IN_ID='don:integration:...'   # paste from list

devrev snap_in deactivate "$SNAP_IN_ID" -o devendra4 -e prod
sleep 5
devrev snap_in delete-one "$SNAP_IN_ID" --force -o devendra4 -e prod
```

Optional: delete an old version if you no longer need it:

```bash
devrev snap_in_version list -o devendra4 -e prod
# devrev snap_in_version delete-one "<VERSION_ID>" -o devendra4 -e prod
```

## 4. Build

```bash
cd "/Users/apple/Devendra/Airsync 2/airdrop-s3-test-artifacts-snap-in/code"
npm run build
```

## 5. Create a new snap-in version

From the directory that contains `manifest.yaml` (repo root):

```bash
cd "/Users/apple/Devendra/Airsync 2/airdrop-s3-test-artifacts-snap-in"
```

**If you already have a package** for this snap-in (recommended after first deploy):

```bash
devrev snap_in_package list -o devendra4 -e prod
# Copy the package ID for S3 Test Artifacts, then:

export SNAP_IN_PACKAGE_ID='don:integration:...:snap_in_package/...'

devrev snap_in_version create-one \
  --path . \
  --package "$SNAP_IN_PACKAGE_ID" \
  -o devendra4 -e prod \
  --wait-status 15
```

**If there is no package yet** (first-time deploy):

```bash
printf 's3-test-artifacts-airsync\n' | devrev snap_in_version create-one \
  --path . \
  --create-package \
  -o devendra4 -e prod \
  --wait-status 15
```

Save the **version ID** from the output.

## 6. Wait until version is `ready`

```bash
devrev snap_in_version show "<VERSION_ID>" -o devendra4 -e prod
```

## 7. Draft and activate

```bash
devrev snap_in draft --snap_in_version "<VERSION_ID>" -o devendra4 -e prod
devrev snap_in activate "<SNAP_IN_ID>" -o devendra4 -e prod
```

(`SNAP_IN_ID` comes from the `draft` output.)

## Scripted redeploy

After auth, you can run:

```bash
cd "/Users/apple/Devendra/Airsync 2/airdrop-s3-test-artifacts-snap-in"
chmod +x scripts/redeploy-devendra4.sh
export SNAP_IN_PACKAGE_ID='don:integration:...:snap_in_package/...'
./scripts/redeploy-devendra4.sh 'don:integration:...:snap_in/...'   # optional: old snap-in to remove
```

The script builds, optionally removes the old snap-in, uploads a new version, and prints the next manual steps (`draft` / `activate`) if the CLI does not return IDs in a parseable form.

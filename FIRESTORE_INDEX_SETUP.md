# Firestore Index Setup for Command Queue

## Problem

The `/api/v1/devices/commands/pending` endpoint returns a **500 error** when ESP32 devices try to fetch pending commands. This happens because the Firestore query requires a composite index that hasn't been created yet.

## Error Details

**ESP32 Console:**
```
[Heartbeat] → Server says we have pending commands!
[Commands] Failed to fetch (code: 500)
```

**Backend Query (controllers/devices.js:833-837):**
```javascript
const pendingCommandsSnapshot = await deviceRef
  .collection('commands')
  .where('status', '==', 'pending')
  .orderBy('created_at', 'asc')  // ← Requires composite index!
  .get();
```

## Solution

Create a Firestore composite index for the `commands` collection with fields `status` and `created_at`.

### Step 1: Verify Index Configuration File

The repository already includes `firestore.indexes.json` with the required index definition:

```json
{
  "indexes": [
    {
      "collectionGroup": "commands",
      "queryScope": "COLLECTION",
      "fields": [
        {
          "fieldPath": "status",
          "order": "ASCENDING"
        },
        {
          "fieldPath": "created_at",
          "order": "ASCENDING"
        }
      ]
    }
  ]
}
```

### Step 2: Install Firebase CLI (if not already installed)

```bash
npm install -g firebase-tools
```

### Step 3: Login to Firebase

```bash
firebase login
```

### Step 4: Initialize Firebase (if not already done)

```bash
firebase init firestore
```

Select:
- Use an existing project (select your project)
- Accept default for `firestore.rules`
- Accept default for `firestore.indexes.json`

### Step 5: Deploy the Index

```bash
firebase deploy --only firestore:indexes
```

**Expected Output:**
```
=== Deploying to 'your-project-id'...

i  firestore: checking firestore.indexes.json for compilation errors...
✔  firestore: compiled firestore.indexes.json successfully
i  firestore: uploading indexes...
✔  firestore: deployed indexes successfully

✔  Deploy complete!
```

### Step 6: Wait for Index to Build

After deployment, Firestore needs to build the index. This can take a few minutes.

**Check index status:**
1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Select your project
3. Navigate to **Firestore Database** → **Indexes**
4. Look for the `commands` collection index
5. Wait until status shows **"Enabled"** (not "Building")

### Step 7: Verify It Works

Test the endpoint from your ESP32 device:

1. Send a command via the frontend or API
2. Device receives heartbeat with `has_pending_commands: true`
3. Device fetches commands from `/api/v1/devices/commands/pending`
4. Should return `200 OK` with commands array

**ESP32 Console (Success):**
```
[Heartbeat] → Server says we have pending commands!
[Commands] Fetched 1 pending command(s)
[Commands] Executing: camera_start (ID: abc123)
```

## Alternative Solution (Quick Fix)

If you can't deploy the index immediately, you can temporarily modify the query to not use `orderBy`:

**In `controllers/devices.js` line 833-837, change:**

```javascript
// TEMPORARY: Remove orderBy to avoid index requirement
const pendingCommandsSnapshot = await deviceRef
  .collection('commands')
  .where('status', '==', 'pending')
  // .orderBy('created_at', 'asc')  // Commented out temporarily
  .get();
```

**Note:** This is NOT recommended for production as it returns commands in random order instead of chronological order.

## Troubleshooting

### Index deployment fails

**Error:** `Error: HTTP Error: 403, The caller does not have permission`

**Solution:** Make sure you're logged in with an account that has admin access to the Firebase project:
```bash
firebase logout
firebase login
```

### Index stays in "Building" state

**Solution:** Index building can take 5-15 minutes for large collections. If it takes longer than 30 minutes, check:
1. Firestore Console for error messages
2. Project quotas and billing status

### Still getting 500 error after deploying

**Solutions:**
1. Check index status is "Enabled" (not "Building")
2. Verify the index appears in Firebase Console
3. Check backend logs: `fly logs` or your hosting platform logs
4. Restart backend server to clear any cached errors

## References

- [Firestore Index Documentation](https://firebase.google.com/docs/firestore/query-data/indexing)
- [Firebase CLI Reference](https://firebase.google.com/docs/cli)
- [Firestore Composite Index Guide](https://firebase.google.com/docs/firestore/query-data/index-overview)

# Pre-Deletion Checklist

Complete these steps BEFORE deleting this repository from your device.

## 1. Verify All Changes Are Committed

```bash
git status
```

**Expected output**: `working tree clean`

If there are uncommitted changes:
```bash
git add -A
git commit -m "Final updates before archiving"
```

## 2. Push to Remote Repository

```bash
git push origin main
```

Verify the push was successful and all commits are on GitHub/remote.

## 3. Verify External Dependencies Are Accessible

Confirm these repositories are accessible (they contain critical dependencies):

- [ ] **Modified ESP-WHO**: https://github.com/ILFforever/esp-who
  - Contains custom power management API modifications
  - Required in ESP-IDF components directory

- [ ] **Arduino-ESP32**: https://github.com/espressif/arduino-esp32
  - Official Espressif Arduino framework
  - Version 3.3.4 required

- [ ] **ArduinoWebsockets Source**: https://github.com/ILFforever/ESP32_Embbeded_Home
  - Contains ArduinoWebsockets component
  - Needed for camera streaming

## 4. Document Your Repository URL

**Your repository URL**: ___________________________________________

Write this down or save it somewhere safe! You'll need it to clone the project later.

## 5. Verify Documentation Is Complete

Check these files exist and are up-to-date:

- [ ] `SETUP.md` - Complete setup instructions
- [ ] `CLAUDE.md` - Project overview and build commands
- [ ] `components/README.md` - Component installation guide
- [ ] `README.md` - Project README (if it exists)

## 6. Optional: Take Screenshots

Consider taking screenshots of:
- Successful build output
- Working camera stream
- Serial monitor showing face recognition
- Power consumption measurements

Save these outside the repository for reference.

## 7. Optional: Export Configuration

If you've customized any settings:

```bash
# Save current sdkconfig
cp sdkconfig sdkconfig.backup

# Commit if it contains important customizations
git add sdkconfig.backup
git commit -m "Backup sdkconfig"
git push
```

## 8. Final Verification

Before deleting, confirm:

- [ ] All code is committed and pushed
- [ ] Remote repository is accessible
- [ ] All external dependency URLs are documented and accessible
- [ ] SETUP.md contains complete restoration instructions
- [ ] You've noted your repository URL

## After Deletion

When you return to this project:

1. Follow the instructions in `SETUP.md`
2. Install ESP-IDF v5.5.1
3. Install modified ESP-WHO from https://github.com/ILFforever/esp-who
4. Clone your repository
5. Install Arduino components as documented
6. Build and flash

**Estimated setup time**: 30-60 minutes (depending on download speeds)

---

## Safe to Delete?

✅ **YES** - If all checkboxes above are completed
❌ **NO** - If any items are incomplete

**Current Date**: __________
**Last Commit**: Run `git log -1 --oneline` to see

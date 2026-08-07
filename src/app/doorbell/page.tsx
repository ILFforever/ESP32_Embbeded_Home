"use client";

import React, { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  Mic,
  Volume2,
  RotateCw,
  Power,
  Users,
  Settings,
  Database,
  ArrowLeft,
  Play,
  Square,
  UserPlus,
  X,
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { useAuth } from "@/context/AuthContext";
import {
  getAllDevices,
  getDeviceHistory,
  getLatestVisitors,
  sendCommand,
  getFaceDatabaseInfo,
  syncFaceDatabase,
  renameFace,
  setFaceName,
  deleteLastFace
} from "@/services/devices.service";
import { getCookie } from "@/utils/cookies";
import type { FaceDatabaseInfo, Visitor } from "@/services/devices.service";
import type { Device } from "@/types/dashboard";
import { notify, confirmDialog } from '@/components/glass/GlassRuntime';
import { ModalPortal } from '@/components/glass/ModalPortal';
import { useModalTransition } from '@/components/glass/useModalTransition';
import StationPresetPicker from '@/components/glass/StationPresetPicker';
import { PageSkeleton } from '@/components/glass/Skeleton';
import { DoorbellAvStream } from "@/services/doorbell-stream.service";

interface ActivityEvent {
  id: string;
  type:
  | "heartbeat"
  | "face_detection"
  | "command"
  | "device_state"
  | "device_log";
  timestamp: any; // Firestore timestamp or ISO string
  data: any;
}

/* Nine tiles is three full rows of the 112px avatar grid. */
const VISITOR_PREVIEW = 9;

/**
 * Plain-language names for the firmware's command verbs.
 *
 * The activity feed printed the wire format — "Command: amp_play",
 * "Command: camera_restart" — which is the board talking to itself. Ground
 * rule 9. Unknown verbs still fall through to the raw action rather than
 * being swallowed, so a new firmware command shows up rather than vanishing.
 */
const COMMAND_COPY: Record<string, string> = {
  amp_play: 'Started playing audio',
  amp_stop: 'Stopped the audio',
  amp_volume: 'Changed the volume',
  camera_restart: 'Restarted the camera',
  camera_start: 'Started the camera',
  camera_stop: 'Stopped the camera',
  mic_start: 'Opened the microphone',
  mic_stop: 'Closed the microphone',
  add_face: 'Started enrolling a face',
  rename_face: 'Renamed a face',
  delete_last_face: 'Removed the last face',
  sync_database: 'Synced the face database',
  restart: 'Restarted the doorbell',
};

function commandCopy(action?: string): string {
  if (!action) return 'Ran a command';
  return COMMAND_COPY[action] ?? `Ran ${action.replace(/_/g, ' ')}`;
}

export default function DoorbellControlPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [doorbellDevice, setDoorbellDevice] = useState<Device | null>(null);
  const [loading, setLoading] = useState(true);
  const [commandLoading, setCommandLoading] = useState<string | null>(null);

  // Control states
  const [cameraActive, setCameraActive] = useState(false);
  const [micActive, setMicActive] = useState(false);
  const [faceRecognition, setFaceRecognition] = useState(false);
  const [ampUrl, setAmpUrl] = useState(
    "http://stream.radioparadise.com/aac-320"
  );
  const [ampVolume, setAmpVolume] = useState(10);
  const [wifiSsid, setWifiSsid] = useState("");
  const [wifiPassword, setWifiPassword] = useState("");
  const [showWifiSettings, setShowWifiSettings] = useState(false);

  // Activity history
  const [recentActivity, setRecentActivity] = useState<ActivityEvent[]>([]);

  // Face database info
  const [faceDatabaseInfo, setFaceDatabaseInfo] =
    useState<FaceDatabaseInfo | null>(null);

  // Latest visitors
  const [latestVisitors, setLatestVisitors] = useState<Visitor[]>([]);

  // Visitor details modal
  const [selectedVisitor, setSelectedVisitor] = useState<Visitor | null>(null);
  const [showVisitorDetails, setShowVisitorDetails] = useState(false);

  // Settings modal
  const [showSettings, setShowSettings] = useState(false);
  const [customDeviceId, setCustomDeviceId] = useState("");
  const [savedDeviceId, setSavedDeviceId] = useState<string | null>(null);

  // Add face modal
  const [showAddFaceModal, setShowAddFaceModal] = useState(false);
  const [newFaceName, setNewFaceName] = useState("");

  // Recognize and name modal
  const [showRecognizeAndNameModal, setShowRecognizeAndNameModal] = useState(false);
  const [recognizeNameInput, setRecognizeNameInput] = useState("");

  // Rename face modal
  const [showRenameFaceModal, setShowRenameFaceModal] = useState(false);
  const [renameFaceId, setRenameFaceId] = useState<number>(1);
  const [renameNewName, setRenameNewName] = useState("");

  // Delete last face confirmation
  const [showDeleteLastConfirm, setShowDeleteLastConfirm] = useState(false);
  /* The rail showed every detection at once — a contact sheet nobody
     reads, and tall enough to set the height of the whole page. Nine is
     three rows: enough to answer "has anyone been by?" at a glance. */
  const [showAllVisitors, setShowAllVisitors] = useState(false);

  /* Each modal is held on screen for its exit animation. selectedVisitor
     is latched too, because closing clears it and the card would empty
     out halfway through fading. */
  const wifiModal = useModalTransition(showWifiSettings);
  const addFaceModal = useModalTransition(showAddFaceModal);
  const renameFaceModal = useModalTransition(showRenameFaceModal);
  const deleteLastModal = useModalTransition(showDeleteLastConfirm);
  const settingsModal = useModalTransition(showSettings);
  const visitorModal = useModalTransition(showVisitorDetails ? selectedVisitor : null);
  const shownVisitor = visitorModal.value;

  // Stream display states
  const [streamError, setStreamError] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);
  const [streamConnecting, setStreamConnecting] = useState(false);
  const [audioContext, setAudioContext] = useState<AudioContext | null>(null);
  const [audioDebugInfo, setAudioDebugInfo] = useState<string>("Initializing...");
  const [videoFrameUrl, setVideoFrameUrl] = useState<string | null>(null);
  const avStreamRef = useRef<DoorbellAvStream | null>(null);

  // Load saved device_id from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("doorbell_device_id");
    if (saved) {
      setSavedDeviceId(saved);
      setCustomDeviceId(saved);
    }
  }, []);

  const streamDeviceId = savedDeviceId || doorbellDevice?.device_id || null;

  // One WebSocket carries timestamped JPEG and compressed audio packets.
  useEffect(() => {
    if ((!cameraActive && !micActive) || !streamDeviceId) {
      avStreamRef.current?.disconnect();
      avStreamRef.current = null;
      setVideoFrameUrl(null);
      return;
    }

    let currentFrameUrl: string | null = null;
    const stream = new DoorbellAvStream({
      apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000",
      deviceId: streamDeviceId,
      onVideoFrame: (jpeg) => {
        if (currentFrameUrl) URL.revokeObjectURL(currentFrameUrl);
        currentFrameUrl = URL.createObjectURL(jpeg);
        setVideoFrameUrl(currentFrameUrl);
        setStreamError(null);
      },
      onStatus: setAudioDebugInfo,
      onError: setStreamError,
    });

    avStreamRef.current = stream;
    stream.setAudioContext(audioContext);
    stream.setMuted(audioMuted);
    stream.connect();

    return () => {
      stream.disconnect();
      if (avStreamRef.current === stream) avStreamRef.current = null;
      if (currentFrameUrl) URL.revokeObjectURL(currentFrameUrl);
      setVideoFrameUrl(null);
    };
  }, [cameraActive, micActive, streamDeviceId]);

  useEffect(() => {
    avStreamRef.current?.setAudioContext(audioContext);
  }, [audioContext]);

  useEffect(() => {
    avStreamRef.current?.setMuted(audioMuted);
  }, [audioMuted]);

  // Get the effective device_id (custom or from backend)
  const getEffectiveDeviceId = () => {
    return savedDeviceId || doorbellDevice?.device_id || null;
  };

  useEffect(() => {
    const fetchDeviceStatus = async () => {
      try {
        const devicesStatus = await getAllDevices();
        const doorbell = devicesStatus.devices.find(
          (d) => d.type === "doorbell"
        );

        if (doorbell) {
          setDoorbellDevice(doorbell);

          // Use custom device_id if set, otherwise use the one from backend
          const deviceIdToUse = savedDeviceId || doorbell.device_id;

          // Fetch recent activity
          if (deviceIdToUse) {
            const history = await getDeviceHistory(deviceIdToUse, 10);
            if (history.history) {
              setRecentActivity(history.history);
            }

            // Fetch face database info
            const faceDbInfo = await getFaceDatabaseInfo(deviceIdToUse);
            setFaceDatabaseInfo(faceDbInfo);

            // Fetch latest visitors
            const visitorsData = await getLatestVisitors(deviceIdToUse, 20);
            if (visitorsData.status === 'ok') {
              setLatestVisitors(Array.isArray(visitorsData.visitors) ? visitorsData.visitors : []);
            }

            // Fetch actual camera/mic status from backend
            try {
              const authToken = getCookie("auth_token");
              const statusResponse = await fetch(
                `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
                }/api/v1/devices/${deviceIdToUse}/status`,
                {
                  headers: {
                    Authorization: `Bearer ${authToken || ""}`,
                  },
                }
              );

              if (statusResponse.ok) {
                const statusData = await statusResponse.json();
                console.log("Doorbell status fetched:", statusData); // Debug log
                if (statusData.status === "ok" && statusData.data) {
                  // Update local state with backend values
                  setCameraActive(statusData.data.camera_active || false);
                  setMicActive(statusData.data.mic_active || false);
                  console.log(
                    "Camera active:",
                    statusData.data.camera_active,
                    "Mic active:",
                    statusData.data.mic_active
                  ); // Debug log
                }
              }
            } catch (statusError) {
              console.error(
                "Error fetching doorbell camera/mic status:",
                statusError
              );
            }
          }
        }
      } catch (error) {
        console.error("Error fetching doorbell status:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchDeviceStatus();
    // Refresh every 5 seconds
    const interval = setInterval(fetchDeviceStatus, 5000);
    return () => clearInterval(interval);
  }, [savedDeviceId]);

  const getStatusClass = () => {
    if (!doorbellDevice || !doorbellDevice.last_seen) return "status-offline";

    const lastSeenDate = new Date(doorbellDevice.last_seen);
    const now = new Date();
    const diffMinutes = (now.getTime() - lastSeenDate.getTime()) / 60000;

    if (diffMinutes < 2) return "status-online";
    if (diffMinutes < 5) return "status-warning";
    return "status-offline";
  };

  const getStatusText = () => {
    if (!doorbellDevice || !doorbellDevice.last_seen) return "OFFLINE";

    const lastSeenDate = new Date(doorbellDevice.last_seen);
    const now = new Date();
    const diffMinutes = Math.floor(
      (now.getTime() - lastSeenDate.getTime()) / 60000
    );

    if (diffMinutes < 2) return "ONLINE";
    if (diffMinutes < 5) return `LAST SEEN ${diffMinutes}M AGO`;
    return "OFFLINE";
  };

  const isDeviceOffline = () => {
    return getStatusClass() === "status-offline";
  };

  // Settings handlers
  const handleSaveSettings = () => {
    if (customDeviceId.trim()) {
      localStorage.setItem("doorbell_device_id", customDeviceId.trim());
      setSavedDeviceId(customDeviceId.trim());
      setShowSettings(false);
      void notify("Device ID saved successfully!");
    } else {
      void notify("Please enter a valid device ID");
    }
  };

  const handleClearSettings = () => {
    localStorage.removeItem("doorbell_device_id");
    setSavedDeviceId(null);
    setCustomDeviceId("");
    setShowSettings(false);
    void notify("Device ID cleared. Using backend default.");
  };

  // Helper function to check if stream is ready
  const waitForStreamReady = async (deviceId: string, maxAttempts = 15, delayMs = 1000): Promise<boolean> => {
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000";
    const authToken = getCookie("auth_token");

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        console.log(`[Stream Check] Attempt ${attempt}/${maxAttempts} - Checking if stream is ready...`);

        // Check the actual camera stream endpoint (not just snapshot)
        // Use AbortController to timeout the request after 3 seconds
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        try {
          const response = await fetch(`${apiUrl}/api/v1/stream/camera/${deviceId}`, {
            headers: {
              Authorization: `Bearer ${authToken || ""}`,
            },
            signal: controller.signal,
          });

          clearTimeout(timeoutId);

          if (response.ok) {
            console.log(`[Stream Check] ✓ Stream is ready! (attempt ${attempt})`);
            // Abort the stream fetch since we just wanted to check availability
            controller.abort();
            return true;
          }

          console.log(`[Stream Check] Stream not ready yet (status: ${response.status}), waiting...`);
        } catch (fetchError: any) {
          clearTimeout(timeoutId);
          // AbortError is expected when we cancel the request
          if (fetchError.name !== 'AbortError') {
            console.log(`[Stream Check] Error fetching stream (attempt ${attempt}):`, fetchError.message);
          }
        }
      } catch (error) {
        console.log(`[Stream Check] Error checking stream (attempt ${attempt}):`, error);
      }

      // Wait before next attempt (unless it's the last one)
      if (attempt < maxAttempts) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    console.log(`[Stream Check] ✗ Stream did not become ready after ${maxAttempts} attempts`);
    return false;
  };

  // Camera control handlers
  const handleCameraToggle = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("camera");
    setStreamError(null);

    try {
      if (cameraActive) {
        // Stopping camera - also deactivate mic and clean up audio
        await sendCommand(deviceId, 'mic_stop');
        await sendCommand(deviceId, 'camera_stop');
        setCameraActive(false);
        setMicActive(false);

        // Clean up audio context
        if (audioContext) {
          audioContext.close();
          setAudioContext(null);
        }
        setAudioDebugInfo("Audio stopped");
      } else {
        // Create/resume Web Audio while this user gesture is still active.
        // Browsers commonly reject audio startup after the later network awaits.
        let streamAudioContext = audioContext;
        if (!streamAudioContext) {
          streamAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 16000,
          });
          setAudioContext(streamAudioContext);
        }
        void streamAudioContext.resume();

        // Camera and microphone are independent device commands. Send both in
        // order so the firmware starts its audio capture/ADPCM task as well as
        // the JPEG producer.
        console.log("[Camera] Sending camera_start and mic_start commands...");
        await sendCommand(deviceId, 'camera_start');
        await sendCommand(deviceId, 'mic_start');

        // Show connecting state
        setStreamConnecting(true);
        console.log("[Camera] Waiting for stream to become ready...");

        // Wait for stream to actually start (max 15 seconds)
        const isReady = await waitForStreamReady(deviceId, 15, 1000);

        setStreamConnecting(false);

        if (isReady) {
          console.log("[Camera] ✓ Stream endpoint is ready, activating camera display");
          setCameraActive(true);

          // Both device commands were queued successfully; enable local playback.
          setMicActive(true);
          console.log("[Mic] ✓ mic_start queued, audio will start streaming");
          setAudioDebugInfo("Starting audio stream...");

        } else {
          console.error("[Camera] ✗ Stream did not start in time");
          setStreamError("Camera started but stream is not available yet. Please wait a moment and try again.");
          // Don't set cameraActive to true since stream isn't ready
        }
      }
    } catch (error) {
      console.error("Error toggling camera:", error);
      setStreamConnecting(false);
      setStreamError("Failed to toggle camera. Please try again.");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleCameraRestart = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("camera_restart");
    try {
      await sendCommand(deviceId, 'camera_restart');
      void notify("Camera restart command sent");
    } catch (error) {
      console.error("Error restarting camera:", error);
      void notify("Failed to restart camera");
    } finally {
      setCommandLoading(null);
    }
  };

  // Microphone mute/unmute handler (frontend only, no backend command)
  const handleMicToggle = () => {
    if (!micActive) {
      // Mic is not started via camera, can't just mute/unmute
      console.log("[Mic] Cannot toggle - mic only works when camera stream is active");
      return;
    }

    const nextMuted = !audioMuted;
    setAudioMuted(nextMuted);

    if (!nextMuted && audioContext?.state === "suspended") {
      void audioContext.resume();
    }

    if (nextMuted) {
      console.log("[Mic] ✓ Audio muted (frontend only)");
      setAudioDebugInfo("Audio muted");
    } else {
      console.log("[Mic] ✓ Audio unmuted (frontend only)");
      setAudioDebugInfo("Starting audio stream...");
    }
  };

  // Amplifier control handlers
  const handlePlayAmplifier = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId || !ampUrl) return;

    setCommandLoading("amp_play");
    try {
      const response = await sendCommand(deviceId, 'amp_play', { url: ampUrl });
      if (response.status === "ok") {
        void notify("Amplifier play command sent");
      } else {
        console.error("Failed to play amplifier:", response);
        void notify("Failed to play amplifier");
      }
    } catch (error) {
      console.error("Error playing amplifier:", error);
      void notify("Failed to play amplifier");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleStopAmplifier = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("amp_stop");
    try {
      const response = await sendCommand(deviceId, 'amp_stop');
      if (response.status === "ok") {
        void notify("Amplifier stopped");
      } else {
        console.error("Failed to stop amplifier:", response);
        void notify("Failed to stop amplifier");
      }
    } catch (error) {
      console.error("Error stopping amplifier:", error);
      void notify("Failed to stop amplifier");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleRestartAmplifier = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("amp_restart");
    try {
      const response = await sendCommand(deviceId, 'amp_restart');
      if (response.status === "ok") {
        void notify("Amplifier restart command sent");
      } else {
        console.error("Failed to restart amplifier:", response);
        void notify("Failed to restart amplifier");
      }
    } catch (error) {
      console.error("Error restarting amplifier:", error);
      void notify("Failed to restart amplifier");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleVolumeChange = (newVolume: number) => {
    // Update local state immediately for responsive UI
    setAmpVolume(newVolume);
  };

  const handleVolumeSend = async (finalVolume: number) => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    // Send volume command to backend only when user releases slider
    try {
      const response = await sendCommand(deviceId, 'amp_volume', { level: finalVolume });

      // Check backend response
      if (response.status === "ok") {
        console.log(`Volume set to ${finalVolume}: ${response.message}`);
      } else {
        console.error("Failed to set volume:", response);
        void notify("Failed to set amplifier volume");
      }
    } catch (error) {
      console.error("Error setting amplifier volume:", error);
      void notify("Failed to set amplifier volume");
    }
  };

  const handleSetAmplifierWifi = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    if (!wifiSsid || !wifiPassword) {
      void notify("Please enter both SSID and password");
      return;
    }

    setCommandLoading("amp_wifi");
    try {
      const response = await sendCommand(deviceId, 'amp_wifi', { ssid: wifiSsid, password: wifiPassword });
      if (response.status === "ok") {
        void notify(
          "WiFi credentials saved. Amplifier will use new credentials on next stream."
        );
        setWifiSsid("");
        setWifiPassword("");
        setShowWifiSettings(false);
      } else {
        console.error("Failed to set WiFi:", response);
        void notify("Failed to set amplifier WiFi");
      }
    } catch (error) {
      console.error("Error setting amplifier WiFi:", error);
      void notify("Failed to set amplifier WiFi");
    } finally {
      setCommandLoading(null);
    }
  };

  // Face recognition handlers
  const handleFaceRecognitionToggle = () => {
    setFaceRecognition(!faceRecognition);
  };

  const handleSyncDatabase = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("sync_database");
    try {
      // Call single sync endpoint - backend/ESP32 handles all three operations
      await syncFaceDatabase(deviceId);
      console.log("✓ Face database sync command queued");

      void notify(
        "Database sync command queued!\n\nThe device will execute:\n• Face count\n• Database check\n• Face list\n\nCheck device serial output for results."
      );
    } catch (error) {
      console.error("Error syncing database:", error);
      void notify("Failed to sync database.");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleAddFace = () => {
    setShowAddFaceModal(true);
  };

  const handleSubmitAddFace = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    if (!newFaceName || !newFaceName.trim()) {
      void notify("Please enter a name for the face.");
      return;
    }

    setCommandLoading("add_face");
    try {
      const authToken = getCookie("auth_token");
      const response = await fetch(
        `${process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"}/api/v1/devices/${deviceId}/face/enroll`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${authToken || ""}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            user_name: newFaceName.trim(),
          }),
        }
      );

      const data = await response.json();

      if (response.ok && data.status === "ok") {
        console.log(`✓ Face enrollment command queued:`, data);
        void notify(
          `Face enrollment started for "${newFaceName}"!\n\nCommand ID: ${data.command_id}\n\nPlease position your face in front of the camera.\n\n${data.message}`
        );

        // Reset form and close modal
        setNewFaceName("");
        setShowAddFaceModal(false);

        // Refresh face database info after adding
        const faceDbInfo = await getFaceDatabaseInfo(deviceId);
        setFaceDatabaseInfo(faceDbInfo);
      } else {
        console.error("Failed to enroll face:", data);
        void notify(`Failed to start face enrollment: ${data.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error adding face:", error);
      void notify("Failed to start face enrollment. Please try again.");
    } finally {
      setCommandLoading(null);
    }
  };

  // Rename face handler
  const handleRenameFaceSubmit = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    if (!renameNewName || !renameNewName.trim()) {
      void notify("Please enter a new name.");
      return;
    }

    if (renameFaceId < 1) {
      void notify("Please enter a valid face ID (1 or greater).");
      return;
    }

    setCommandLoading("rename_face");
    try {
      const response = await renameFace(deviceId, renameFaceId, renameNewName.trim());

      if (response.status === "ok") {
        console.log(`✓ Rename face command queued:`, response);
        void notify(
          `Face ID ${renameFaceId} will be renamed to "${renameNewName.trim()}"\n\n${response.message || ""}`
        );

        // Reset form and close modal
        setRenameNewName("");
        setRenameFaceId(1);
        setShowRenameFaceModal(false);

        // Refresh face database info
        const faceDbInfo = await getFaceDatabaseInfo(deviceId);
        setFaceDatabaseInfo(faceDbInfo);
      } else {
        console.error("Failed to rename face:", response);
        void notify(`Failed: ${response.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error renaming face:", error);
      void notify("Failed to rename face. Please try again.");
    } finally {
      setCommandLoading(null);
    }
  };

  // Delete last face handler
  const handleDeleteLastFace = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("delete_last_face");
    setShowDeleteLastConfirm(false);
    try {
      const response = await deleteLastFace(deviceId);

      if (response.status === "ok") {
        console.log(`✓ Delete last face command queued:`, response);
        void notify(
          `Last enrolled face will be deleted.\n\n${response.message || ""}`
        );

        // Refresh face database info
        const faceDbInfo = await getFaceDatabaseInfo(deviceId);
        setFaceDatabaseInfo(faceDbInfo);
      } else {
        console.error("Failed to delete last face:", response);
        void notify(`Failed: ${response.message || "Unknown error"}`);
      }
    } catch (error) {
      console.error("Error deleting last face:", error);
      void notify("Failed to delete face. Please try again.");
    } finally {
      setCommandLoading(null);
    }
  };

  // System control handler
  const handleSystemRestart = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    if (
      !await confirmDialog(
        "It will be offline for about 30 seconds. Nobody will be recognised while it reboots.",
        { title: "Restart the doorbell?", danger: true, okLabel: "Restart" }
      )
    ) {
      return;
    }

    setCommandLoading("system_restart");
    try {
      await sendCommand(deviceId, 'system_restart');
      void notify("System restart command sent. Device will reboot shortly.");
    } catch (error) {
      console.error("Error restarting system:", error);
      void notify("Failed to restart system");
    } finally {
      setCommandLoading(null);
    }
  };

  // Visitor details handler
  const handleVisitorClick = (visitor: Visitor) => {
    setSelectedVisitor(visitor);
    setShowVisitorDetails(true);
  };

  const formatActivityTime = (timestamp: any) => {
    // Handle Firestore timestamp or ISO string
    let date: Date;
    if (timestamp?.toDate) {
      date = timestamp.toDate();
    } else if (typeof timestamp === "string") {
      date = new Date(timestamp);
    } else if (timestamp?._seconds) {
      // Handle Firestore timestamp object with _seconds
      date = new Date(timestamp._seconds * 1000);
    } else if (typeof timestamp === "number") {
      // Handle Unix timestamp (milliseconds)
      date = new Date(timestamp);
    } else {
      // If no valid timestamp, return 'N/A' instead of current time
      return "N/A";
    }
    return date.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const getActivityDescription = (event: ActivityEvent) => {
    if (event.type === "face_detection") {
      const recognized = event.data?.recognized || false;
      const name = event.data?.name || "Unknown";
      const confidence = event.data?.confidence * 100 || 0;
      if (recognized && name !== "Unknown") {
        // "CFD" is the firmware's abbreviation, not a word.
        return `${name} was recognised · ${confidence.toFixed(0)}% match`;
      }
      return "Someone the camera did not recognise";
    }
    if (event.type === "command") {
      // "Command: amp_play" is the wire format. Name what happened.
      return commandCopy(event.data?.action);
    }
    if (event.type === "heartbeat") {
      const uptime = event.data?.uptime_ms
        ? Math.floor(event.data.uptime_ms / 60000)
        : 0;
      return `Heartbeat (uptime: ${uptime}m)`;
    }
    if (event.type === "device_state") {
      const ip = event.data?.ip_address || "N/A";
      const heap = event.data?.free_heap
        ? Math.floor(event.data.free_heap / 1024)
        : 0;
      return `Device state (IP: ${ip}, Heap: ${heap}KB)`;
    }
    if (event.type === "device_log") {
      const message = event.data?.message || "Log entry";
      const errorMsg = event.data?.error_message;
      if (errorMsg) {
        return `${message}: ${errorMsg}`;
      }
      return message;
    }
    return "Activity detected";
  };

  /* Runs of the same event collapse into one row with a count. The board
     re-sends a command until it is acked, so an offline doorbell filled
     the whole feed with four identical "Started playing audio" lines and
     pushed the face detections out of view. */
  const collapsedActivity = React.useMemo(() => {
    const rows: { event: ActivityEvent; description: string; repeats: number }[] = [];
    for (const event of recentActivity) {
      const description = getActivityDescription(event);
      const last = rows[rows.length - 1];
      if (last && last.description === description) {
        last.repeats += 1;
        continue;
      }
      rows.push({ event, description, repeats: 1 });
      if (rows.length === 6) break;
    }
    return rows;
    // getActivityDescription is a stable local helper.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recentActivity]);

  const getActivityStatus = (event: ActivityEvent) => {
    if (event.type === "face_detection") {
      return event.data?.recognized ? "Known" : "Unknown";
    }
    if (event.type === "command") {
      const status = event.data?.status || "pending";
      if (status === "stale") return "Stale";
      return status.charAt(0).toUpperCase() + status.slice(1);
    }
    if (event.type === "heartbeat") {
      return "Active";
    }
    if (event.type === "device_state") {
      return "Online";
    }
    if (event.type === "device_log") {
      const level = event.data?.level || "INFO";
      return level.charAt(0).toUpperCase() + level.slice(1).toLowerCase();
    }
    return "Event";
  };

  const getActivityStatusClass = (event: ActivityEvent) => {
    if (event.type === "face_detection") {
      return event.data?.recognized ? "status-safe" : "status-warning";
    }
    if (event.type === "command") {
      const status = event.data?.status || "pending";
      if (status === "completed") return "status-safe";
      if (status === "failed") return "status-danger";
      if (status === "stale") return "status-warning";
      return "status-warning";
    }
    if (event.type === "heartbeat" || event.type === "device_state") {
      return "status-safe";
    }
    if (event.type === "device_log") {
      const level = event.data?.level?.toUpperCase() || "INFO";
      if (level === "ERROR" || level === "CRITICAL") return "status-danger";
      if (level === "WARNING" || level === "WARN") return "status-warning";
      return "status-safe";
    }
    return "status-safe";
  };

  const statusClass = getStatusClass();
  const statusTone = statusClass === "status-online" ? "" : statusClass === "status-warning" ? " is-warn" : " is-off";
  const effectiveDeviceId = getEffectiveDeviceId();
  const knownVisitors = latestVisitors.filter((visitor) => visitor.recognized).length;
  const visitorCount = latestVisitors.length;
  const dbHealthOk = faceDatabaseInfo?.db_status === "valid";
  const dbStatusLabel = faceDatabaseInfo?.db_status || "unknown";
  const closeAddFaceModal = () => {
    if (commandLoading !== "add_face") {
      setShowAddFaceModal(false);
      setNewFaceName("");
    }
  };
  const closeRenameFaceModal = () => {
    if (commandLoading !== "rename_face") {
      setShowRenameFaceModal(false);
      setRenameNewName("");
      setRenameFaceId(1);
    }
  };
  const formatVisitorTime = (visitor: Visitor) => {
    const stamp = visitor.detected_at || visitor.timestamp;
    if (!stamp) return "N/A";
    const value = stamp._seconds ? stamp._seconds * 1000 : stamp;
    return new Date(value).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <PageSkeleton label="Checking the doorbell connection." variant="device" />
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="g-page">
        {/* The door camera currently sends BGR-labelled image data. Swap
            red and blue after decode so the live feed and saved captures
            render as sRGB without affecting images elsewhere in the app. */}
        <svg className="doorbell-color-filter" aria-hidden="true" width="0" height="0">
          <defs>
            <filter id="doorbell-swap-red-blue" colorInterpolationFilters="sRGB">
              <feColorMatrix
                type="matrix"
                values="0 0 1 0 0
                        0 1 0 0 0
                        1 0 0 0 0
                        0 0 0 1 0"
              />
            </filter>
          </defs>
        </svg>

        <div className="g-pane g-bar">
          <button className="g-back" type="button" onClick={() => router.push("/dashboard")} title="Back to dashboard">
            <ArrowLeft size={16} aria-hidden="true" />
            Home
          </button>
          <span className="g-bar__brand">Doorbell</span>
          <div className="g-spacer" />
          <button className="g-theme" type="button" aria-label="Switch between light and dark" title="Switch theme">
            <svg className="g-theme__moon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" /></svg>
            <svg className="g-theme__sun" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" /></svg>
          </button>
          <span className={`g-pill${statusTone}`}><i /> {getStatusText()}</span>
        </div>

        <div className="g-title">
          <h1>Front door</h1>
          {/* "20 visitors loaded" is the fetch describing itself, and the
              device id is a row key. Say what the page is for. */}
          <p>
            {loading
              ? "Checking the doorbell connection."
              : isDeviceOffline()
                ? "The doorbell is not reporting, so the camera and microphone cannot be reached."
                : "Watch the door, talk to whoever is there, and manage the faces it knows."}
          </p>
        </div>

        <div className="doorbell-layout">
          <div className="doorbell-main">
            <section className="g-pane g-card doorbell-live">
              <header>
                <h2>Live view</h2>
                <div className="g-row g-row--wrap" style={{ gap: "var(--s-2)" }}>
                  <button className="g-btn g-btn--ghost" type="button" onClick={handleCameraToggle} disabled={commandLoading === "camera" || isDeviceOffline()}>
                    <Camera size={16} aria-hidden="true" />
                    {commandLoading === "camera" ? "Working" : cameraActive ? "Stop stream" : "Start stream"}
                  </button>
                  <button className="g-btn g-btn--ghost" type="button" onClick={handleMicToggle} disabled={!micActive || isDeviceOffline()}>
                    <Mic size={16} aria-hidden="true" />
                    {!micActive ? "Mic auto" : audioMuted ? "Unmute" : "Mute"}
                  </button>
                </div>
              </header>

              <div className="g-media" style={{ minHeight: 320 }}>
                {(cameraActive || streamConnecting) && (
                  <span className="g-media__badge"><span className="g-dot g-dot--ok" /> {streamConnecting ? "CONNECTING" : "LIVE"}</span>
                )}
                {streamConnecting ? (
                  <div className="g-media__empty">
                    <Camera size={40} aria-hidden="true" />
                    <p style={{ margin: 0 }}>Connecting to camera stream<br /><span className="g-dim">Waiting for the ESP32 stream.</span></p>
                  </div>
                ) : effectiveDeviceId && cameraActive && videoFrameUrl ? (
                  <img
                    className="doorbell-color-corrected"
                    src={videoFrameUrl}
                    alt="Live camera feed"
                    style={{ width: "100%", height: "100%", minHeight: 320, objectFit: "contain", display: "block" }}
                  />
                ) : (
                  <div className="g-media__empty">
                    <Camera size={40} aria-hidden="true" />
                    <p style={{ margin: 0 }}>{!effectiveDeviceId ? "No device paired" : cameraActive ? "Waiting for the first frame" : "Camera is not active"}<br /><span className="g-dim">{cameraActive ? "The combined stream is connected and warming up." : "Start the camera to view the live stream."}</span></p>
                  </div>
                )}
              </div>

              {streamError && <div className="g-error" style={{ marginTop: "var(--s-4)" }}>{streamError}</div>}
              {effectiveDeviceId && (cameraActive || micActive) && (
                <p className="g-sub" style={{ textAlign: "center" }}>Streaming from <span className="g-mono">{effectiveDeviceId}</span></p>
              )}

              {effectiveDeviceId && micActive && (
                <div className="g-tile" style={{ marginTop: "var(--s-4)", display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                  <Mic size={20} aria-hidden="true" style={{ color: "var(--accent)", flex: "none" }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: "14px", fontWeight: 600 }}>Audio stream {audioMuted ? "muted" : "playing"}</div>
                    <div className="g-sub" style={{ margin: "2px 0 0", fontSize: "12px" }}>IMA ADPCM · 16 kHz · mono</div>
                  </div>
                  <span className={`g-chip ${audioMuted ? "g-chip--warn" : "g-chip--ok"}`}>{audioMuted ? "Muted" : "Connected"}</span>
                </div>
              )}

              {effectiveDeviceId && micActive && !audioMuted && (
                <div className="g-log" style={{ marginTop: "var(--s-4)" }}>
                  <div><strong>Combined audio/video WebSocket</strong></div>
                  <div>Status: {audioDebugInfo}</div>
                  <div>Transport: one timestamped binary stream</div>
                  <div>Format: JPEG 5 FPS + IMA ADPCM 16 kHz mono</div>
                </div>
              )}
            </section>

            <section className="g-pane g-card doorbell-people">
              <header><h2>Recognised people</h2><span className={`g-chip ${dbHealthOk ? "g-chip--ok" : "g-chip--warn"}`}>{dbHealthOk ? "Database healthy" : dbStatusLabel}</span></header>
              <div className="g-tile" style={{ marginBottom: "var(--s-4)" }}>
                <p className="g-label">People enrolled</p>
                <div className="g-metric-sm g-num" style={{ marginTop: 6 }}>{faceDatabaseInfo?.count ?? 0}</div>
              </div>
              <p className="g-label" style={{ marginBottom: 8 }}>Enrolled</p>
              {faceDatabaseInfo?.faces?.length ? (
                <div className="g-row g-row--wrap" style={{ gap: 6, marginBottom: "var(--s-5)" }}>
                  {faceDatabaseInfo.faces.map((face) => <span key={face.id} className="g-chip">{face.id} · {face.name}</span>)}
                </div>
              ) : (
                <p className="g-sub" style={{ marginBottom: "var(--s-5)" }}>No enrolled faces reported by the device.</p>
              )}
              <div className="g-row g-row--wrap" style={{ gap: "var(--s-2)" }}>
                <button className="g-btn g-btn--ghost" type="button" onClick={handleFaceRecognitionToggle}>{faceRecognition ? "Set idle" : "Trigger recognition"}</button>
                <button className="g-btn g-btn--ghost" type="button" onClick={handleSyncDatabase} disabled={commandLoading === "sync_database"}><Database size={16} aria-hidden="true" />{commandLoading === "sync_database" ? "Syncing" : "Sync now"}</button>
                {user?.role === "admin" && <button className="g-btn g-btn--primary" type="button" onClick={handleAddFace} disabled={commandLoading === "add_face"}><UserPlus size={16} aria-hidden="true" />Add a person</button>}
                {user?.role === "admin" && <button className="g-btn g-btn--ghost" type="button" onClick={() => setShowRenameFaceModal(true)} disabled={commandLoading === "rename_face"}>Rename</button>}
                {user?.role === "admin" && <button className="g-btn g-btn--danger" type="button" onClick={() => setShowDeleteLastConfirm(true)} disabled={commandLoading === "delete_last_face"}>Remove last</button>}
              </div>
              <p className="g-sub" style={{ fontSize: "12px" }}>Adding and removing people is admin-only.</p>
            </section>

            <section className="g-pane g-card doorbell-audio">
              <header>
                <div>
                  <h2>Chime and audio</h2>
                  <p className="g-sub">Play a station through the doorbell speaker.</p>
                </div>
                <span className="g-label">Doorbell speaker</span>
              </header>
              <div className="doorbell-audio__body">
                <div className="g-field g-field--mono">
                  <label htmlFor="db-url">Audio source</label>
                  <div className="doorbell-audio__source">
                    <input id="db-url" type="url" value={ampUrl} onChange={(e) => setAmpUrl(e.target.value)} placeholder="Paste a stream URL" />
                    <StationPresetPicker value={ampUrl} onChange={setAmpUrl} ariaLabel="Choose a doorbell station preset" />
                  </div>
                </div>

                <div className="doorbell-audio__volume">
                  <div className="doorbell-audio__volume-head">
                    <label htmlFor="db-vol">Playback volume</label>
                    <output htmlFor="db-vol">{ampVolume}<small>/21</small></output>
                  </div>
                  <input
                    id="db-vol"
                    className="g-slider"
                    type="range"
                    min="0"
                    max="21"
                    value={ampVolume}
                    onChange={(e) => handleVolumeChange(parseInt(e.target.value))}
                    onMouseUp={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value))}
                    onTouchEnd={(e) => handleVolumeSend(parseInt((e.target as HTMLInputElement).value))}
                    style={{ backgroundImage: `linear-gradient(to right, var(--accent) 0 ${(ampVolume / 21) * 100}%, var(--sunken) ${(ampVolume / 21) * 100}% 100%)` }}
                  />
                  <div className="doorbell-audio__scale" aria-hidden="true"><span>Quiet</span><span>Full</span></div>
                </div>

                <div className="doorbell-audio__actions">
                  <button className="g-btn g-btn--primary" type="button" onClick={handlePlayAmplifier} disabled={commandLoading === "amp_play"}>
                    <Play size={16} aria-hidden="true" />
                    {commandLoading === "amp_play" ? "Starting" : "Play stream"}
                  </button>
                  <button className="g-btn g-btn--ghost" type="button" onClick={handleStopAmplifier} disabled={commandLoading === "amp_stop"}>
                    <Square size={15} aria-hidden="true" />
                    {commandLoading === "amp_stop" ? "Stopping" : "Stop"}
                  </button>
                  <button className="g-btn g-btn--ghost doorbell-audio__restart" type="button" onClick={handleRestartAmplifier} disabled={commandLoading === "amp_restart"}>
                    <RotateCw size={15} aria-hidden="true" />
                    {commandLoading === "amp_restart" ? "Restarting" : "Restart amplifier"}
                  </button>
                </div>
              </div>
            </section>

            <section className="g-pane g-card">
              <header><h2>Submodule command</h2><span className="g-label">Maintenance</span></header>
              <div className="g-grid g-grid--2">
                <button className="g-action" type="button" onClick={handleCameraRestart} disabled={commandLoading === "camera_restart"}>
                  <Camera size={18} aria-hidden="true" /> {commandLoading === "camera_restart" ? "Restarting camera" : "Restart camera"}
                  <small>Use this when the live stream stops responding.</small>
                </button>
                <button className="g-action" type="button" onClick={handleRestartAmplifier} disabled={commandLoading === "amp_restart"}>
                  <Volume2 size={18} aria-hidden="true" /> {commandLoading === "amp_restart" ? "Restarting amplifier" : "Restart amplifier"}
                  <small>Restarts only the audio board.</small>
                </button>
                <button className="g-action" type="button" onClick={() => setShowWifiSettings(true)} disabled={commandLoading === "amp_wifi"}>
                  <Settings size={18} aria-hidden="true" /> Amplifier Wi-Fi
                  <small>Send SSID and password to the amplifier.</small>
                </button>
                <button className="g-action" type="button" onClick={handleSystemRestart} disabled={commandLoading === "system_restart"}>
                  <Power size={18} aria-hidden="true" /> {commandLoading === "system_restart" ? "Restarting system" : "Restart doorbell"}
                  <small>The device will be offline for about 30 seconds.</small>
                </button>
              </div>
            </section>
          </div>

          <div className="doorbell-rail">
            <section className="g-pane g-card doorbell-visitors">
              <header>
                <h2>Who&apos;s been by</h2>
                {latestVisitors.length > VISITOR_PREVIEW ? (
                  <button className="g-btn g-btn--ghost" type="button" onClick={() => setShowAllVisitors(v => !v)}>
                    {showAllVisitors ? 'Show fewer' : `All ${latestVisitors.length}`}
                  </button>
                ) : (
                  <span className="g-label">{latestVisitors.length} recent</span>
                )}
              </header>
              {latestVisitors.length > 0 ? (
                <div className="g-avatars">
                  {(showAllVisitors ? latestVisitors : latestVisitors.slice(0, VISITOR_PREVIEW)).map((visitor) => (
                    <button
                      key={visitor.id}
                      type="button"
                      className={`g-avatar ${visitor.recognized ? "g-avatar--known" : "g-avatar--unknown"}`}
                      onClick={() => handleVisitorClick(visitor)}
                      style={{ border: 0, background: "transparent", color: "inherit", padding: 0, cursor: "pointer" }}
                    >
                      <span className="g-avatar__img">
                        {visitor.image ? (
                          <img className="doorbell-color-corrected" src={visitor.image} alt={visitor.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} />
                        ) : (
                          <Users size={30} aria-hidden="true" />
                        )}
                      </span>
                      <b>{visitor.name}</b>
                      <span>{formatVisitorTime(visitor)}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="g-empty"><Users size={32} aria-hidden="true" /><strong>No visitors yet</strong><p>The latest face detections will appear here.</p></div>
              )}
              <p className="g-sub">{knownVisitors} recognised. Unknown visitors stay amber until named.</p>
            </section>

            <section className="g-pane g-card doorbell-activity">
              <header><h2>Recent activity</h2><span className="g-label">last 10</span></header>
              {recentActivity.length > 0 ? (
                <div className="g-list">
                  {collapsedActivity.map(({ event, description, repeats }, index) => (
                    <div key={event.id || index} className="g-list__row">
                      <i className={`g-dot ${getActivityStatusClass(event) === "status-danger" ? "g-dot--crit" : getActivityStatusClass(event) === "status-warning" ? "g-dot--warn" : "g-dot--ok"}`} />
                      <p>
                        {description}
                        <span>
                          {formatActivityTime(event.timestamp)}
                          {repeats > 1 && ` · ${repeats} times`}
                        </span>
                      </p>
                      <span className={`g-chip ${getActivityStatusClass(event) === "status-danger" ? "g-chip--crit" : getActivityStatusClass(event) === "status-warning" ? "g-chip--warn" : "g-chip--ok"}`}>{getActivityStatus(event)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="g-empty"><Database size={32} aria-hidden="true" /><strong>No recent activity</strong><p>Doorbell events will appear here after the first heartbeat.</p></div>
              )}
            </section>

              <section className="g-pane g-card">
                <header><h2>Device information</h2><button className="g-btn g-btn--ghost" type="button" onClick={() => setShowSettings(true)}>Pair device</button></header>
                <dl className="g-info">
                  <div><dt>Device ID</dt><dd>{doorbellDevice?.device_id || "N/A"}</dd></div>
                  <div><dt>Status</dt><dd>{getStatusText()}</dd></div>
                  <div><dt>IP address</dt><dd>{isDeviceOffline() ? "-" : doorbellDevice?.ip_address || "N/A"}</dd></div>
                  <div><dt>Last seen</dt><dd>{doorbellDevice?.last_seen ? new Date(doorbellDevice.last_seen).toLocaleString() : "Never"}</dd></div>
                  <div><dt>Wi-Fi signal</dt><dd>{isDeviceOffline() ? "-" : doorbellDevice?.wifi_rssi ? `${doorbellDevice.wifi_rssi} dBm` : "N/A"}</dd></div>
                  <div><dt>Free heap</dt><dd>{isDeviceOffline() ? "-" : doorbellDevice?.free_heap ? `${(doorbellDevice.free_heap / 1024).toFixed(1)} KB` : "N/A"}</dd></div>
                  <div><dt>Uptime</dt><dd>{isDeviceOffline() ? "-" : doorbellDevice?.uptime_ms ? `${Math.floor(doorbellDevice.uptime_ms / 3600000)}h ${Math.floor((doorbellDevice.uptime_ms % 3600000) / 60000)}m` : "N/A"}</dd></div>
                </dl>
              </section>
          </div>
        </div>
      </div>

      {wifiModal.render && (
        <ModalPortal>
          <div className={wifiModal.className} role="dialog" aria-modal="true" aria-labelledby="m-wifi-h" onClick={() => setShowWifiSettings(false)}>
            <div className="g-pane g-modal__card" onClick={(e) => e.stopPropagation()}>
              <div className="g-modal__head"><div><h2 id="m-wifi-h">Amplifier Wi-Fi settings</h2><p>Send network credentials to the audio board.</p></div><button className="g-icon-btn" type="button" onClick={() => setShowWifiSettings(false)} aria-label="Close"><X size={15} strokeWidth={2} aria-hidden="true" /></button></div>
              <div className="g-stack">
                <div className="g-field"><label htmlFor="wifi-ssid">Wi-Fi SSID</label><input id="wifi-ssid" type="text" value={wifiSsid} onChange={(e) => setWifiSsid(e.target.value)} /></div>
                <div className="g-field"><label htmlFor="wifi-password">Wi-Fi password</label><input id="wifi-password" type="password" value={wifiPassword} onChange={(e) => setWifiPassword(e.target.value)} /></div>
              </div>
              <div className="g-modal__foot"><button className="g-btn g-btn--ghost" type="button" onClick={() => setShowWifiSettings(false)}>Cancel</button><button className="g-btn g-btn--primary" type="button" onClick={handleSetAmplifierWifi} disabled={commandLoading === "amp_wifi"}>{commandLoading === "amp_wifi" ? "Saving" : "Save"}</button></div>
            </div>
          </div>
        </ModalPortal>
      )}

      {addFaceModal.render && (
        <ModalPortal>
          <div className={addFaceModal.className} role="dialog" aria-modal="true" aria-labelledby="m-addface-h" onClick={closeAddFaceModal}>
            <div className="g-pane g-modal__card" onClick={(e) => e.stopPropagation()}>
              <div className="g-modal__head"><div><h2 id="m-addface-h">Add a person</h2><p>They need to stand in front of the camera while the doorbell captures their face.</p></div><button className="g-icon-btn" type="button" onClick={closeAddFaceModal} aria-label="Close"><X size={15} strokeWidth={2} aria-hidden="true" /></button></div>
              <div className="g-field"><label htmlFor="face-name">Their name</label><input id="face-name" type="text" value={newFaceName} onChange={(e) => setNewFaceName(e.target.value)} placeholder="Mum" disabled={commandLoading === "add_face"} /><span className="g-field__hint">Shown in the activity log whenever they are recognised.</span></div>
              <div className="g-modal__foot"><button className="g-btn g-btn--ghost" type="button" onClick={closeAddFaceModal} disabled={commandLoading === "add_face"}>Cancel</button><button className="g-btn g-btn--primary" type="button" onClick={handleSubmitAddFace} disabled={commandLoading === "add_face"}>{commandLoading === "add_face" ? "Processing" : "Start capture"}</button></div>
            </div>
          </div>
        </ModalPortal>
      )}

      {renameFaceModal.render && (
        <ModalPortal>
          <div className={renameFaceModal.className} role="dialog" aria-modal="true" aria-labelledby="m-rename-h" onClick={closeRenameFaceModal}>
            <div className="g-pane g-modal__card" onClick={(e) => e.stopPropagation()}>
              <div className="g-modal__head"><div><h2 id="m-rename-h">Rename a person</h2><p>Changes the name on their stored face, not the face itself.</p></div><button className="g-icon-btn" type="button" onClick={closeRenameFaceModal} aria-label="Close"><X size={15} strokeWidth={2} aria-hidden="true" /></button></div>
              <div className="g-stack">
                <div className="g-field"><label htmlFor="rename-face-id">Face ID</label><input id="rename-face-id" type="number" min="1" value={renameFaceId} onChange={(e) => setRenameFaceId(parseInt(e.target.value) || 1)} disabled={commandLoading === "rename_face"} /></div>
                <div className="g-field"><label htmlFor="rename-face-name">New name</label><input id="rename-face-name" type="text" value={renameNewName} onChange={(e) => setRenameNewName(e.target.value)} placeholder="Natthapat" disabled={commandLoading === "rename_face"} /></div>
              </div>
              <div className="g-modal__foot"><button className="g-btn g-btn--ghost" type="button" onClick={closeRenameFaceModal} disabled={commandLoading === "rename_face"}>Cancel</button><button className="g-btn g-btn--primary" type="button" onClick={handleRenameFaceSubmit} disabled={commandLoading === "rename_face"}>{commandLoading === "rename_face" ? "Renaming" : "Rename"}</button></div>
            </div>
          </div>
        </ModalPortal>
      )}

      {deleteLastModal.render && (
        <ModalPortal>
          <div className={deleteLastModal.className} role="dialog" aria-modal="true" aria-labelledby="m-delete-h" onClick={() => setShowDeleteLastConfirm(false)}>
            <div className="g-pane g-modal__card" onClick={(e) => e.stopPropagation()}>
              <div className="g-modal__head"><div><h2 id="m-delete-h">Remove the last enrolled face?</h2><p>The doorbell will stop recognising that person. You can add them again later.</p></div></div>
              <div className="g-modal__foot"><button className="g-btn g-btn--ghost" type="button" onClick={() => setShowDeleteLastConfirm(false)}>Cancel</button><button className="g-btn g-btn--danger" type="button" onClick={handleDeleteLastFace} disabled={commandLoading === "delete_last_face"}>{commandLoading === "delete_last_face" ? "Removing" : "Remove"}</button></div>
            </div>
          </div>
        </ModalPortal>
      )}

      {settingsModal.render && (
        <ModalPortal>
          <div className={settingsModal.className} role="dialog" aria-modal="true" aria-labelledby="m-settings-h" onClick={() => setShowSettings(false)}>
            <div className="g-pane g-modal__card" onClick={(e) => e.stopPropagation()}>
              <div className="g-modal__head"><div><h2 id="m-settings-h">Doorbell settings</h2><p>Only change this if the app should point at a different board.</p></div><button className="g-icon-btn" type="button" onClick={() => setShowSettings(false)} aria-label="Close"><X size={15} strokeWidth={2} aria-hidden="true" /></button></div>
              <div className="g-field g-field--mono"><label htmlFor="dev-id">Device ID</label><input id="dev-id" type="text" value={customDeviceId} onChange={(e) => setCustomDeviceId(e.target.value)} placeholder="db_001" /><span className="g-field__hint">Leave blank to use whatever the server reports.</span></div>
              <div className="g-modal__foot"><button className="g-btn g-btn--ghost" type="button" onClick={handleClearSettings}>Use server default</button><button className="g-btn g-btn--primary" type="button" onClick={handleSaveSettings}>Save</button></div>
            </div>
          </div>
        </ModalPortal>
      )}

      {visitorModal.render && shownVisitor && (
        <ModalPortal>
          <div className={visitorModal.className} role="dialog" aria-modal="true" aria-labelledby="m-visitor-h" onClick={() => setShowVisitorDetails(false)}>
            <div className="g-pane g-modal__card g-modal__card--wide" onClick={(e) => e.stopPropagation()}>
              <div className="g-modal__head"><div><h2 id="m-visitor-h">{shownVisitor.name}</h2><p>{shownVisitor.recognized ? "Recognised visitor" : "Unknown visitor"}</p></div><button className="g-icon-btn" type="button" onClick={() => setShowVisitorDetails(false)} aria-label="Close"><X size={15} strokeWidth={2} aria-hidden="true" /></button></div>
              <div className="g-grid g-grid--2">
                <div className={`g-avatar ${shownVisitor.recognized ? "g-avatar--known" : "g-avatar--unknown"}`}>
                  <div className="g-avatar__img" style={{ maxWidth: 240, width: "100%", justifySelf: "center" }}>
                    {shownVisitor.image ? <img className="doorbell-color-corrected" src={shownVisitor.image} alt={shownVisitor.name} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <Users size={48} aria-hidden="true" />}
                  </div>
                </div>
                <div className="g-stack">
                  <dl className="g-info">
                    <div><dt>Status</dt><dd>{shownVisitor.recognized ? "Recognised" : "Unknown"}</dd></div>
                    <div><dt>Confidence</dt><dd>{shownVisitor.confidence > 0 ? `${(shownVisitor.confidence * 100).toFixed(1)}%` : "N/A"}</dd></div>
                    <div><dt>Detected at</dt><dd>{shownVisitor.detected_at ? new Date(shownVisitor.detected_at._seconds ? shownVisitor.detected_at._seconds * 1000 : shownVisitor.detected_at).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" }) : "N/A"}</dd></div>
                    <div><dt>Detection ID</dt><dd>{shownVisitor.id}</dd></div>
                  </dl>
                  {shownVisitor.confidence > 0 && <div><div className="g-meter-row"><span className="g-label">Confidence</span><b>{(shownVisitor.confidence * 100).toFixed(0)}%</b></div><div className="g-meter"><i className={shownVisitor.recognized ? "" : "is-warn"} style={{ width: `${shownVisitor.confidence * 100}%` }} /></div></div>}
                </div>
              </div>
            </div>
          </div>
        </ModalPortal>
      )}
    </ProtectedRoute>
  );
}

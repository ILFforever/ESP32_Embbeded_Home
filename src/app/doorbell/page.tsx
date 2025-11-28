"use client";

import React, { useState, useEffect } from "react";
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
} from "lucide-react";
import ProtectedRoute from "@/components/auth/ProtectedRoute";
import { getAllDevices, getDeviceHistory, getLatestVisitors } from "@/services/devices.service";
import { getCookie } from "@/utils/cookies";
import {
  startCamera,
  stopCamera,
  restartCamera,
  startMicrophone,
  stopMicrophone,
  playAmplifier,
  stopAmplifier,
  restartAmplifier,
  setAmplifierVolume,
  getAmplifierStatus,
  listAmplifierFiles,
  setAmplifierWifi,
  syncFaceDatabase,
  getFaceDatabaseInfo,
  restartSystem,
} from "@/services/devices.service";
import type { FaceDatabaseInfo, Visitor } from "@/services/devices.service";
import type { Device } from "@/types/dashboard";

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

export default function DoorbellControlPage() {
  const router = useRouter();
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

  // Stream display states
  const [streamError, setStreamError] = useState<string | null>(null);
  const [audioMuted, setAudioMuted] = useState(false);

  // Load saved device_id from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("doorbell_device_id");
    if (saved) {
      setSavedDeviceId(saved);
      setCustomDeviceId(saved);
    }
  }, []);

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
              setLatestVisitors(visitorsData.visitors);
            }

            // Fetch actual camera/mic status from backend
            try {
              const authToken = getCookie("auth_token");
              const statusResponse = await fetch(
                `${
                  process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
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
      alert("Device ID saved successfully!");
    } else {
      alert("Please enter a valid device ID");
    }
  };

  const handleClearSettings = () => {
    localStorage.removeItem("doorbell_device_id");
    setSavedDeviceId(null);
    setCustomDeviceId("");
    setShowSettings(false);
    alert("Device ID cleared. Using backend default.");
  };

  // Camera control handlers
  const handleCameraToggle = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("camera");
    try {
      if (cameraActive) {
        await stopCamera(deviceId);
      } else {
        await startCamera(deviceId);
      }
      setCameraActive(!cameraActive);
    } catch (error) {
      console.error("Error toggling camera:", error);
      alert("Failed to toggle camera");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleCameraRestart = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("camera_restart");
    try {
      await restartCamera(deviceId);
      alert("Camera restart command sent");
    } catch (error) {
      console.error("Error restarting camera:", error);
      alert("Failed to restart camera");
    } finally {
      setCommandLoading(null);
    }
  };

  // Microphone control handlers
  const handleMicToggle = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("mic");
    try {
      if (micActive) {
        await stopMicrophone(deviceId);
      } else {
        await startMicrophone(deviceId);
      }
      setMicActive(!micActive);
    } catch (error) {
      console.error("Error toggling mic:", error);
      alert("Failed to toggle microphone");
    } finally {
      setCommandLoading(null);
    }
  };

  // Amplifier control handlers
  const handlePlayAmplifier = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId || !ampUrl) return;

    setCommandLoading("amp_play");
    try {
      const response = await playAmplifier(deviceId, ampUrl);
      if (response.status === "ok") {
        alert("Amplifier play command sent");
      } else {
        console.error("Failed to play amplifier:", response);
        alert("Failed to play amplifier");
      }
    } catch (error) {
      console.error("Error playing amplifier:", error);
      alert("Failed to play amplifier");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleStopAmplifier = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("amp_stop");
    try {
      const response = await stopAmplifier(deviceId);
      if (response.status === "ok") {
        alert("Amplifier stopped");
      } else {
        console.error("Failed to stop amplifier:", response);
        alert("Failed to stop amplifier");
      }
    } catch (error) {
      console.error("Error stopping amplifier:", error);
      alert("Failed to stop amplifier");
    } finally {
      setCommandLoading(null);
    }
  };

  const handleRestartAmplifier = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    setCommandLoading("amp_restart");
    try {
      const response = await restartAmplifier(deviceId);
      if (response.status === "ok") {
        alert("Amplifier restart command sent");
      } else {
        console.error("Failed to restart amplifier:", response);
        alert("Failed to restart amplifier");
      }
    } catch (error) {
      console.error("Error restarting amplifier:", error);
      alert("Failed to restart amplifier");
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
      const response = await setAmplifierVolume(deviceId, finalVolume);

      // Check backend response
      if (response.status === "ok") {
        console.log(`Volume set to ${finalVolume}: ${response.message}`);
      } else {
        console.error("Failed to set volume:", response);
        alert("Failed to set amplifier volume");
      }
    } catch (error) {
      console.error("Error setting amplifier volume:", error);
      alert("Failed to set amplifier volume");
    }
  };

  const handleSetAmplifierWifi = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    if (!wifiSsid || !wifiPassword) {
      alert("Please enter both SSID and password");
      return;
    }

    setCommandLoading("amp_wifi");
    try {
      const response = await setAmplifierWifi(deviceId, wifiSsid, wifiPassword);
      if (response.status === "ok") {
        alert(
          "WiFi credentials saved. Amplifier will use new credentials on next stream."
        );
        setWifiSsid("");
        setWifiPassword("");
        setShowWifiSettings(false);
      } else {
        console.error("Failed to set WiFi:", response);
        alert("Failed to set amplifier WiFi");
      }
    } catch (error) {
      console.error("Error setting amplifier WiFi:", error);
      alert("Failed to set amplifier WiFi");
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

      alert(
        "Database sync command queued!\n\nThe device will execute:\n• Face count\n• Database check\n• Face list\n\nCheck device serial output for results."
      );
    } catch (error) {
      console.error("Error syncing database:", error);
      alert("Failed to sync database.");
    } finally {
      setCommandLoading(null);
    }
  };

  // System control handler
  const handleSystemRestart = async () => {
    const deviceId = getEffectiveDeviceId();
    if (!deviceId) return;

    if (
      !confirm(
        "Are you sure you want to restart the doorbell system? It will be offline for about 30 seconds."
      )
    ) {
      return;
    }

    setCommandLoading("system_restart");
    try {
      await restartSystem(deviceId);
      alert("System restart command sent. Device will reboot shortly.");
    } catch (error) {
      console.error("Error restarting system:", error);
      alert("Failed to restart system");
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
        return `Face recognized: ${name} (CFD : ${confidence.toFixed(0)}%)`;
      }
      return "Unknown face detected";
    }
    if (event.type === "command") {
      const action = event.data?.action || "unknown";
      return `Command: ${action}`;
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

  const getActivityStatus = (event: ActivityEvent) => {
    if (event.type === "face_detection") {
      return event.data?.recognized ? "Known" : "Unknown";
    }
    if (event.type === "command") {
      const status = event.data?.status || "pending";
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

  return (
    <ProtectedRoute>
      <div className="main-content" style={{ marginLeft: 0 }}>
        <div className="dashboard-container">
          <header className="dashboard-header">
            <div className="dashboard-header-left">
              <button
                className="sidebar-toggle"
                onClick={() => router.push("/dashboard")}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
                title="Back to Dashboard"
              >
                <ArrowLeft size={20} />
              </button>
              <h1>DOORBELL CONTROL</h1>
            </div>
            <div className="dashboard-header-right">
              <div className="header-info">
                <span className={`status-dot ${getStatusClass()}`}></span>
                <span>{getStatusText()}</span>
              </div>
            </div>
          </header>

          <div className="control-page-grid">
            {/* Live Camera & Audio Stream */}
            <div className="card control-card-large">
              <div className="card-header">
                <h3>LIVE CAMERA & AUDIO STREAM</h3>
              </div>
              <div className="card-content">
                {/* Stream Controls */}
                <div
                  style={{
                    display: "flex",
                    gap: "12px",
                    marginBottom: "20px",
                    padding: "16px",
                    backgroundColor: "rgba(33, 150, 243, 0.05)",
                    borderRadius: "8px",
                    border: "1px solid rgba(33, 150, 243, 0.2)",
                  }}
                >
                  <button
                    className={`btn-control ${
                      cameraActive ? "btn-stop" : "btn-start"
                    }`}
                    onClick={handleCameraToggle}
                    disabled={commandLoading === "camera" || isDeviceOffline()}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      padding: "12px 24px",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    <Camera size={18} />
                    {commandLoading === "camera"
                      ? "PROCESSING..."
                      : cameraActive
                      ? "STOP STREAM"
                      : "START STREAM"}
                  </button>
                  <button
                    className={`btn-control ${
                      micActive ? "btn-stop" : "btn-start"
                    }`}
                    onClick={handleMicToggle}
                    disabled={commandLoading === "mic" || isDeviceOffline()}
                    style={{
                      flex: 1,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "8px",
                      padding: "12px 24px",
                      fontSize: "14px",
                      fontWeight: "600",
                    }}
                  >
                    <Mic size={18} />
                    {commandLoading === "mic"
                      ? "PROCESSING..."
                      : micActive
                      ? "MIC OFF"
                      : "MIC ON"}
                  </button>
                </div>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "16px",
                    alignItems: "center",
                  }}
                >
                  {/* Camera Stream */}
                  <div
                    style={{
                      width: "100%",
                      maxWidth: "800px",
                      position: "relative",
                      backgroundColor: "#000",
                      borderRadius: "12px",
                      overflow: "hidden",
                      boxShadow: "0 4px 12px rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    {getEffectiveDeviceId() && cameraActive ? (
                      <>
                        <img
                          src={`${
                            process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
                          }/api/v1/stream/camera/${getEffectiveDeviceId()}`}
                          alt="Live Camera Feed"
                          style={{
                            width: "100%",
                            height: "auto",
                            display: "block",
                            minHeight: "400px",
                            objectFit: "contain",
                          }}
                          onError={() => {
                            setStreamError("Failed to load camera stream. Make sure the camera is streaming.");
                          }}
                          onLoad={() => {
                            setStreamError(null);
                          }}
                        />
                        <div
                          style={{
                            position: "absolute",
                            top: "12px",
                            left: "12px",
                            backgroundColor: "rgba(76, 175, 80, 0.9)",
                            color: "white",
                            padding: "6px 12px",
                            borderRadius: "6px",
                            fontSize: "12px",
                            fontWeight: "600",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px",
                          }}
                        >
                          <span
                            style={{
                              width: "8px",
                              height: "8px",
                              backgroundColor: "#fff",
                              borderRadius: "50%",
                              animation: "pulse 2s ease-in-out infinite",
                            }}
                          />
                          LIVE
                        </div>
                      </>
                    ) : (
                      <div
                        style={{
                          width: "100%",
                          minHeight: "400px",
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          justifyContent: "center",
                          color: "#666",
                          gap: "12px",
                        }}
                      >
                        <Camera size={64} color="#444" />
                        <div style={{ fontSize: "16px", fontWeight: "600" }}>
                          {!getEffectiveDeviceId()
                            ? "No device paired"
                            : !cameraActive
                            ? "Camera is not active"
                            : "Waiting for stream..."}
                        </div>
                        {!cameraActive && getEffectiveDeviceId() && (
                          <div style={{ fontSize: "14px", color: "#888" }}>
                            Start the camera to view live stream
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Stream Error Message */}
                  {streamError && (
                    <div
                      style={{
                        width: "100%",
                        maxWidth: "800px",
                        padding: "12px",
                        backgroundColor: "rgba(244, 67, 54, 0.1)",
                        border: "1px solid rgba(244, 67, 54, 0.3)",
                        borderRadius: "8px",
                        color: "#d32f2f",
                        fontSize: "14px",
                        fontWeight: "500",
                      }}
                    >
                      ⚠ {streamError}
                    </div>
                  )}

                  {/* Audio Stream Controls */}
                  {getEffectiveDeviceId() && micActive && (
                    <div
                      style={{
                        width: "100%",
                        maxWidth: "800px",
                        padding: "16px",
                        backgroundColor: "rgba(33, 150, 243, 0.1)",
                        border: "1px solid rgba(33, 150, 243, 0.3)",
                        borderRadius: "8px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        gap: "16px",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        <Mic size={24} color="#2196F3" />
                        <div>
                          <div style={{ fontSize: "14px", fontWeight: "600", color: "#2196F3" }}>
                            Audio Stream Active
                          </div>
                          <div style={{ fontSize: "12px", color: "#666" }}>
                            PCM Audio Stream (16kHz, 16-bit, Mono)
                          </div>
                        </div>
                      </div>
                      <button
                        onClick={() => setAudioMuted(!audioMuted)}
                        className="btn-control"
                        style={{
                          padding: "8px 16px",
                          fontSize: "13px",
                          fontWeight: "600",
                          backgroundColor: audioMuted ? "#f44336" : "#4caf50",
                          borderColor: audioMuted ? "#f44336" : "#4caf50",
                          display: "flex",
                          alignItems: "center",
                          gap: "6px",
                        }}
                      >
                        {audioMuted ? "🔇 MUTED" : "🔊 UNMUTED"}
                      </button>
                    </div>
                  )}

                  {/* Audio Element (Hidden) */}
                  {getEffectiveDeviceId() && micActive && !audioMuted && (
                    <audio
                      autoPlay
                      controls
                      style={{ width: "100%", maxWidth: "800px" }}
                      onError={(e) => {
                        console.error("Audio stream error:", e);
                        setStreamError("Failed to play audio stream. Audio format may not be supported by your browser.");
                      }}
                    >
                      <source
                        src={`${
                          process.env.NEXT_PUBLIC_API_URL || "http://localhost:5000"
                        }/api/v1/stream/audio/${getEffectiveDeviceId()}`}
                        type="audio/pcm"
                      />
                      Your browser does not support audio streaming.
                    </audio>
                  )}

                  {/* Stream Info */}
                  {getEffectiveDeviceId() && (cameraActive || micActive) && (
                    <div
                      style={{
                        width: "100%",
                        maxWidth: "800px",
                        fontSize: "12px",
                        color: "#888",
                        textAlign: "center",
                      }}
                    >
                      Streaming from device: <span style={{ fontFamily: "monospace", color: "#2196F3" }}>{getEffectiveDeviceId()}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Latest Visitors */}
            <div className="card control-card-large">
              <div className="card-header">
                <h3>LATEST VISITORS</h3>
              </div>
              <div className="card-content">
                <div
                  style={{
                    display: "grid",
                    gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
                    gap: "16px",
                    padding: "8px",
                    maxHeight: "600px",
                    overflowY: "auto",
                  }}
                >
                  {latestVisitors.length > 0 ? (
                    latestVisitors.map((visitor) => (
                      <div
                        key={visitor.id}
                        onClick={() => handleVisitorClick(visitor)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          gap: "8px",
                          cursor: "pointer",
                          transition: "transform 0.2s ease",
                        }}
                        onMouseEnter={(e) => {
                          e.currentTarget.style.transform = "scale(1.05)";
                        }}
                        onMouseLeave={(e) => {
                          e.currentTarget.style.transform = "scale(1)";
                        }}
                      >
                        <div
                          style={{
                            width: "100px",
                            height: "100px",
                            borderRadius: "16px",
                            overflow: "hidden",
                            border: visitor.recognized
                              ? "3px solid #4CAF50"
                              : "3px solid #FF9800",
                            boxShadow: "0 2px 8px rgba(0, 0, 0, 0.15)",
                            backgroundColor: "#f0f0f0",
                          }}
                        >
                          {visitor.image ? (
                            <img
                              src={visitor.image}
                              alt={visitor.name}
                              style={{
                                width: "100%",
                                height: "100%",
                                objectFit: "cover",
                              }}
                              onError={(e) => {
                                (e.target as HTMLImageElement).style.display =
                                  "none";
                              }}
                            />
                          ) : (
                            <div
                              style={{
                                width: "100%",
                                height: "100%",
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                fontSize: "48px",
                                color: "#999",
                              }}
                            >
                              👤
                            </div>
                          )}
                        </div>
                        <div
                          style={{
                            textAlign: "center",
                            fontSize: "12px",
                            fontWeight: "600",
                            color: visitor.recognized ? "#4CAF50" : "#FF9800",
                            maxWidth: "100px",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {visitor.name}
                        </div>
                        {visitor.confidence > 0 && (
                          <div
                            style={{
                              fontSize: "10px",
                              color: "#666",
                            }}
                          >
                            {(visitor.confidence * 100).toFixed(0)}%
                          </div>
                        )}
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        gridColumn: "1 / -1",
                        textAlign: "center",
                        padding: "40px 20px",
                        color: "#6c757d",
                        fontSize: "14px",
                      }}
                    >
                      No visitors detected yet
                    </div>
                  )}
                </div>
              </div>
            </div>


            {/* Column 2: Amplifier & Face Recognition */}
            <div className="card">
              <div className="card-header">
                <h3>AUDIO AMPLIFIER</h3>
              </div>
              <div className="card-content">
                <div className="control-panel">
                  <div className="control-status">
                    <Volume2 size={48} className="status-info-large" />
                    <div className="status-label">
                      <span className="status-text">AMPLIFIER</span>
                      <span className="status-description">
                        Stream audio to amplifier
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "8px",
                      width: "100%",
                      marginTop: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                      }}
                    >
                      <label
                        style={{
                          fontSize: "13px",
                          fontWeight: "600",
                          color: "#555",
                          minWidth: "80px",
                        }}
                      >
                        VOLUME: {ampVolume}
                      </label>
                      <input
                        type="range"
                        min="0"
                        max="21"
                        value={ampVolume}
                        onChange={(e) =>
                          handleVolumeChange(parseInt(e.target.value))
                        }
                        onMouseUp={(e) =>
                          handleVolumeSend(
                            parseInt((e.target as HTMLInputElement).value)
                          )
                        }
                        onTouchEnd={(e) =>
                          handleVolumeSend(
                            parseInt((e.target as HTMLInputElement).value)
                          )
                        }
                        className="volume-slider"
                        style={{
                          flex: 1,
                          height: "6px",
                          borderRadius: "3px",
                          background: `linear-gradient(to right, #4CAF50 0%, #4CAF50 ${
                            (ampVolume / 21) * 100
                          }%, #e0e0e0 ${
                            (ampVolume / 21) * 100
                          }%, #e0e0e0 100%)`,
                          outline: "none",
                          cursor: "pointer",
                          transition: "background 0.15s ease",
                        }}
                      />
                    </div>
                    <div style={{ position: "relative", width: "100%" }}>
                      <input
                        type="text"
                        value={ampUrl}
                        onChange={(e) => setAmpUrl(e.target.value)}
                        placeholder="Enter stream URL (e.g., http://stream.example.com/audio)"
                        className="control-input"
                        style={{
                          width: "100%",
                          padding: "10px 45px 10px 12px",
                          borderRadius: "6px",
                          border: "2px solid #e0e0e0",
                          fontSize: "13px",
                          fontFamily: "monospace",
                          transition: "all 0.2s ease",
                          outline: "none",
                          backgroundColor: "#f8f9fa",
                        }}
                        onFocus={(e) => {
                          e.target.style.borderColor = "#2196F3";
                          e.target.style.backgroundColor = "#fff";
                        }}
                        onBlur={(e) => {
                          e.target.style.borderColor = "#e0e0e0";
                          e.target.style.backgroundColor = "#f8f9fa";
                        }}
                      />
                      <select
                        onChange={(e) => setAmpUrl(e.target.value)}
                        value=""
                        className="stream-selector"
                        style={{
                          position: "absolute",
                          right: "4px",
                          top: "50%",
                          transform: "translateY(-50%)",
                          padding: "6px 8px",
                          borderRadius: "4px",
                          border: "1px solid #e0e0e0",
                          fontSize: "13px",
                          backgroundColor: "#fff",
                          cursor: "pointer",
                          outline: "none",
                          transition: "all 0.2s ease",
                          appearance: "none",
                          WebkitAppearance: "none",
                          MozAppearance: "none",
                          backgroundImage:
                            "url(\"data:image/svg+xml;charset=UTF-8,%3csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23333' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3e%3cpolyline points='6 9 12 15 18 9'%3e%3c/polyline%3e%3c/svg%3e\")",
                          backgroundRepeat: "no-repeat",
                          backgroundPosition: "center",
                          backgroundSize: "18px",
                          width: "32px",
                          height: "32px",
                          color: "transparent",
                        }}
                        onMouseEnter={(e) => {
                          (
                            e.target as HTMLSelectElement
                          ).style.backgroundColor = "#f0f0f0";
                        }}
                        onMouseLeave={(e) => {
                          (
                            e.target as HTMLSelectElement
                          ).style.backgroundColor = "#fff";
                        }}
                      >
                        <option value="" style={{ color: "#000" }}>
                          Select Station
                        </option>
                        <option
                          value="https://stream.live.vc.bbcmedia.co.uk/bbc_world_service_east_asia"
                          style={{ color: "#000" }}
                        >
                          BBC World Service
                        </option>
                        <option
                          value="https://play.streamafrica.net/japancitypop"
                          style={{ color: "#000" }}
                        >
                          Japan City Pop
                        </option>
                        <option
                          value="http://stream.radioparadise.com/aac-128"
                          style={{ color: "#000" }}
                        >
                          Radio Paradise
                        </option>
                      </select>
                    </div>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        className="btn-control btn-start"
                        onClick={handlePlayAmplifier}
                        disabled={commandLoading === "amp_play"}
                        style={{ flex: 1 }}
                      >
                        {commandLoading === "amp_play" ? "SENDING..." : "PLAY"}
                      </button>
                      <button
                        className="btn-control btn-stop"
                        onClick={handleStopAmplifier}
                        disabled={commandLoading === "amp_stop"}
                        style={{ flex: 1 }}
                      >
                        {commandLoading === "amp_stop" ? "STOPPING..." : "STOP"}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="control-divider"></div>

                <div className="card-header" style={{ paddingTop: "8px" }}>
                  <h3>FACE RECOGNITION</h3>
                </div>
                <div className="control-panel">
                  <div className="control-status">
                    <Users
                      size={48}
                      className={
                        faceRecognition
                          ? "status-active-large"
                          : "status-inactive-large"
                      }
                    />
                    <div className="status-label">
                      <span className="status-text">
                        {faceRecognition ? "TRIGGERED" : "IDLE"}
                      </span>
                      <span className="status-description">
                        {faceRecognition
                          ? "Identifying visitors"
                          : "Face recognition idle"}
                      </span>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "flex",
                      gap: "8px",
                      flexWrap: "wrap",
                      marginTop: "12px",
                    }}
                  >
                    <button
                      className={`btn-control ${
                        faceRecognition ? "btn-stop" : "btn-start"
                      }`}
                      onClick={handleFaceRecognitionToggle}
                    >
                      {faceRecognition ? "IDLE" : "TRIGGER"}
                    </button>
                    <button
                      className="btn-control btn-warning"
                      onClick={handleSyncDatabase}
                      disabled={commandLoading === "sync_database"}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "6px",
                        flex: "1 1 auto",
                      }}
                    >
                      <Database size={16} />
                      {commandLoading === "sync_database"
                        ? "SYNCING..."
                        : "SYNC DATABASE"}
                    </button>
                  </div>

                  {/* Face Database Info Display */}
                  {faceDatabaseInfo && (
                    <div
                      style={{
                        marginTop: "16px",
                        padding: "12px",
                        background:
                          "linear-gradient(135deg, rgba(156, 39, 176, 0.1) 0%, rgba(123, 31, 162, 0.1) 100%)",
                        borderRadius: "8px",
                        border: "1px solid rgba(156, 39, 176, 0.3)",
                      }}
                    >
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#9c27b0",
                          marginBottom: "8px",
                        }}
                      >
                        DATABASE STATUS
                      </div>
                      <div
                        style={{
                          display: "flex",
                          gap: "16px",
                          flexWrap: "wrap",
                        }}
                      >
                        <div style={{ flex: "1", minWidth: "120px" }}>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.6)",
                              marginBottom: "4px",
                            }}
                          >
                            Face Count
                          </div>
                          <div
                            style={{
                              fontSize: "18px",
                              fontWeight: "700",
                              color: "#fff",
                            }}
                          >
                            {faceDatabaseInfo.count}
                          </div>
                        </div>
                        <div style={{ flex: "1", minWidth: "120px" }}>
                          <div
                            style={{
                              fontSize: "11px",
                              color: "rgba(255,255,255,0.6)",
                              marginBottom: "4px",
                            }}
                          >
                            DB Health
                          </div>
                          <div
                            style={{
                              fontSize: "14px",
                              fontWeight: "600",
                              color:
                                faceDatabaseInfo.db_status === "valid"
                                  ? "#4caf50"
                                  : "#f44336",
                            }}
                          >
                            {faceDatabaseInfo.db_status?.toUpperCase() ||
                              "UNKNOWN"}
                          </div>
                        </div>
                      </div>

                      {/* Face List */}
                      {faceDatabaseInfo.faces &&
                        faceDatabaseInfo.faces.length > 0 && (
                          <div style={{ marginTop: "12px" }}>
                            <div
                              style={{
                                fontSize: "11px",
                                color: "rgba(255,255,255,0.6)",
                                marginBottom: "6px",
                              }}
                            >
                              Enrolled Faces
                            </div>
                            <div
                              style={{
                                display: "flex",
                                gap: "6px",
                                flexWrap: "wrap",
                              }}
                            >
                              {faceDatabaseInfo.faces.map((face) => (
                                <div
                                  key={face.id}
                                  style={{
                                    padding: "4px 10px",
                                    background: "rgba(156, 39, 176, 0.2)",
                                    borderRadius: "12px",
                                    fontSize: "11px",
                                    fontWeight: "500",
                                    color: "#e1bee7",
                                    border: "1px solid rgba(156, 39, 176, 0.4)",
                                  }}
                                >
                                  ID {face.id}: {face.name}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Sub Module Command & Recent Activity */}
            <div className="card">
              <div className="card-header">
                <h3>SUB MODULE COMMAND</h3>
              </div>
              <div className="card-content">
                <div className="control-panel">
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px",
                        background:
                          "linear-gradient(135deg, rgba(255, 193, 7, 0.1) 0%, rgba(255, 152, 0, 0.1) 100%)",
                        borderRadius: "8px",
                        border: "1px solid rgba(255, 193, 7, 0.3)",
                      }}
                    >
                      <Camera
                        size={32}
                        className="status-warning-large"
                        style={{ flexShrink: 0 }}
                      />
                      <button
                        className="btn-control"
                        onClick={handleCameraRestart}
                        disabled={commandLoading === "camera_restart"}
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          gap: "8px",
                          flex: 1,
                          fontWeight: "bold",
                          background: "rgba(0, 0, 0, 0.4)",
                          border: "1px solid rgba(255, 255, 255, 0.2)",
                          color: "#fff",
                        }}
                      >
                        <RotateCw
                          size={18}
                          className={
                            commandLoading === "camera_restart"
                              ? "rotating"
                              : ""
                          }
                        />
                        {commandLoading === "camera_restart"
                          ? "RESTARTING..."
                          : "RESTART CAMERA"}
                      </button>
                    </div>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "12px",
                        padding: "12px",
                        background:
                          "linear-gradient(135deg, rgba(243, 33, 33, 0.1) 0%, rgba(192, 44, 21, 0.1) 100%)",
                        borderRadius: "8px",
                        border: "1px solid rgba(243, 79, 33, 0.3)",
                      }}
                    >
                      <Volume2
                        size={32}
                        className="status-info-large"
                        style={{ flexShrink: 0 }}
                      />
                      <div
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          gap: "8px",
                          flex: 1,
                        }}
                      >
                        <button
                          className="btn-control"
                          onClick={handleRestartAmplifier}
                          disabled={commandLoading === "amp_restart"}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            flex: 1,
                            fontWeight: "bold",
                            background: "rgba(0, 0, 0, 0.4)",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            color: "#fff",
                          }}
                        >
                          <RotateCw
                            size={18}
                            className={
                              commandLoading === "amp_restart" ? "rotating" : ""
                            }
                          />
                          {commandLoading === "amp_restart"
                            ? "RESTARTING..."
                            : "RESTART AMPLIFIER"}
                        </button>

                        <button
                          className="btn-control btn-info"
                          onClick={() => setShowWifiSettings(true)}
                          disabled={commandLoading === "amp_wifi"}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            gap: "8px",
                            flex: 1,
                            fontWeight: "bold",
                            background: "rgba(0, 0, 0, 0.4)",
                            border: "1px solid rgba(255, 255, 255, 0.2)",
                            color: "#fff",
                          }}
                        >
                          <Settings size={14} />
                          WIFI
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="control-divider"></div>

                <div className="card-header" style={{ paddingTop: "8px" }}>
                  <h3>RECENT ACTIVITY</h3>
                </div>
                <div className="activity-list">
                  {recentActivity.length > 0 ? (
                    recentActivity.map((event, index) => (
                      <div key={event.id || index} className="activity-item">
                        <span className="activity-time">
                          {formatActivityTime(event.timestamp)}
                        </span>
                        <span className="activity-desc">
                          {getActivityDescription(event)}
                        </span>
                        <span
                          className={`activity-status ${getActivityStatusClass(
                            event
                          )}`}
                        >
                          {getActivityStatus(event)}
                        </span>
                      </div>
                    ))
                  ) : (
                    <div
                      style={{
                        textAlign: "center",
                        padding: "40px 20px",
                        color: "#6c757d",
                        fontSize: "14px",
                        fontStyle: "italic",
                      }}
                    >
                      No recent activity
                    </div>
                  )}
                </div>
              </div>
            </div>
            {/* Column 3: System Control & Device Info */}
            <div className="card">
              <div className="card-header">
                <h3>SYSTEM CONTROL</h3>
              </div>
              <div className="card-content">
                <div className="control-panel">
                  <div className="control-status">
                    <Power size={48} className="status-danger-large" />
                    <div className="status-label">
                      <span className="status-text">SYSTEM POWER</span>
                      <span className="status-description">
                        Restart the doorbell device
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn-control btn-danger"
                    onClick={handleSystemRestart}
                    disabled={commandLoading === "system_restart"}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                      marginTop: "12px",
                    }}
                  >
                    <RotateCw size={16} />
                    {commandLoading === "system_restart"
                      ? "RESTARTING..."
                      : "RESTART SYSTEM"}
                  </button>
                </div>

                <div className="control-divider"></div>

                <div className="device-info-section">
                  <h4>DEVICE INFORMATION</h4>
                  <div className="info-grid">
                    <div className="info-item">
                      <span className="info-label">Device ID:</span>
                      <span className="info-value">
                        {doorbellDevice?.device_id || "N/A"}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Status:</span>
                      <span className="info-value">{getStatusText()}</span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">IP Address:</span>
                      <span className="info-value">
                        {isDeviceOffline()
                          ? "-"
                          : (doorbellDevice?.ip_address || "N/A")}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Last Seen:</span>
                      <span className="info-value">
                        {doorbellDevice?.last_seen
                          ? new Date(doorbellDevice.last_seen).toLocaleString()
                          : "Never"}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">WiFi Signal:</span>
                      <span className="info-value">
                        {isDeviceOffline()
                          ? "-"
                          : (doorbellDevice?.wifi_rssi
                              ? `${doorbellDevice.wifi_rssi} dBm`
                              : "N/A")}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Free Heap:</span>
                      <span className="info-value">
                        {isDeviceOffline()
                          ? "-"
                          : (doorbellDevice?.free_heap
                              ? `${(doorbellDevice.free_heap / 1024).toFixed(1)} KB`
                              : "N/A")}
                      </span>
                    </div>
                    <div className="info-item">
                      <span className="info-label">Uptime:</span>
                      <span className="info-value">
                        {isDeviceOffline()
                          ? "-"
                          : (doorbellDevice?.uptime_ms
                              ? `${Math.floor(
                                  doorbellDevice.uptime_ms / 3600000
                                )}h ${Math.floor(
                                  (doorbellDevice.uptime_ms % 3600000) / 60000
                                )}m`
                              : "N/A")}
                      </span>
                    </div>
                  </div>
                  <button
                    className="btn-control btn-info"
                    onClick={() => setShowSettings(true)}
                    style={{
                      marginTop: "16px",
                      width: "100%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      gap: "6px",
                    }}
                  >
                    ⚙️ PAIR DEVICE
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* WiFi Settings Modal */}
      {showWifiSettings && (
        <div
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.5)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              backgroundColor: "white",
              borderRadius: "8px",
              padding: "24px",
              maxWidth: "400px",
              width: "90%",
              boxShadow: "0 4px 6px rgba(0, 0, 0, 0.1)",
            }}
          >
            <h3 style={{ marginTop: 0, marginBottom: "16px", color: "#333" }}>
              Amplifier WiFi Settings
            </h3>
            <div
              style={{ display: "flex", flexDirection: "column", gap: "12px" }}
            >
              <input
                type="text"
                value={wifiSsid}
                onChange={(e) => setWifiSsid(e.target.value)}
                placeholder="WiFi SSID"
                className="control-input"
                style={{
                  padding: "10px",
                  fontSize: "14px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
              <input
                type="password"
                value={wifiPassword}
                onChange={(e) => setWifiPassword(e.target.value)}
                placeholder="WiFi Password"
                className="control-input"
                style={{
                  padding: "10px",
                  fontSize: "14px",
                  borderRadius: "4px",
                  border: "1px solid #ddd",
                }}
              />
              <div style={{ display: "flex", gap: "8px", marginTop: "8px" }}>
                <button
                  className="btn-control btn-warning"
                  onClick={handleSetAmplifierWifi}
                  disabled={commandLoading === "amp_wifi"}
                  style={{ flex: 1, fontSize: "14px", padding: "10px" }}
                >
                  {commandLoading === "amp_wifi" ? "SAVING..." : "SAVE"}
                </button>
                <button
                  className="btn-control"
                  onClick={() => setShowWifiSettings(false)}
                  style={{
                    flex: 1,
                    fontSize: "14px",
                    padding: "10px",
                    backgroundColor: "#6c757d",
                    borderColor: "#6c757d",
                  }}
                >
                  CANCEL
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Visitor Details Modal */}
      {showVisitorDetails && selectedVisitor && (
        <div
          onClick={() => setShowVisitorDetails(false)}
          style={{
            position: "fixed",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: "rgba(0, 0, 0, 0.7)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 1000,
            padding: "20px",
            overflowY: "auto",
          }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="card"
            style={{
              borderRadius: "12px",
              padding: "24px",
              maxWidth: "500px",
              width: "100%",
              boxShadow: "0 8px 24px rgba(0, 0, 0, 0.2)",
              margin: "auto",
              maxHeight: "fit-content",
            }}
          >
            <div
              style={{
                display: "flex",
                gap: "20px",
              }}
            >
              {/* Image on the left */}
              <div
                style={{
                  flex: "0 0 auto",
                }}
              >
                <div
                  style={{
                    width: "180px",
                    height: "180px",
                    borderRadius: "16px",
                    overflow: "hidden",
                    border: selectedVisitor.recognized
                      ? "4px solid #4CAF50"
                      : "4px solid #FF9800",
                    boxShadow: "0 4px 12px rgba(0, 0, 0, 0.15)",
                    backgroundColor: "#f0f0f0",
                  }}
                >
                  {selectedVisitor.image ? (
                    <img
                      src={selectedVisitor.image}
                      alt={selectedVisitor.name}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                      }}
                    />
                  ) : (
                    <div
                      style={{
                        width: "100%",
                        height: "100%",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        fontSize: "96px",
                        color: "#999",
                      }}
                    >
                      👤
                    </div>
                  )}
                </div>
              </div>

              {/* Information on the right */}
              <div
                style={{
                  flex: "1",
                  display: "flex",
                  flexDirection: "column",
                }}
              >
                <h2
                  style={{
                    marginTop: 0,
                    marginBottom: "14px",
                    color: selectedVisitor.recognized ? "#4CAF50" : "#FF9800",
                    fontSize: "22px",
                    fontWeight: "700",
                  }}
                >
                  {selectedVisitor.name}
                </h2>

                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: "12px",
                    flex: 1,
                  }}
                >
                  {/* Recognition Status */}
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#666",
                        textTransform: "uppercase",
                        marginBottom: "4px",
                      }}
                    >
                      Status
                    </div>
                    <div
                      style={{
                        display: "inline-block",
                        padding: "6px 12px",
                        borderRadius: "20px",
                        backgroundColor: selectedVisitor.recognized
                          ? "rgba(76, 175, 80, 0.1)"
                          : "rgba(255, 152, 0, 0.1)",
                        color: selectedVisitor.recognized
                          ? "#4CAF50"
                          : "#FF9800",
                        fontWeight: "600",
                        fontSize: "14px",
                      }}
                    >
                      {selectedVisitor.recognized ? "✓ Recognized" : "⚠ Unknown"}
                    </div>
                  </div>

                  {/* Confidence */}
                  {selectedVisitor.confidence > 0 && (
                    <div>
                      <div
                        style={{
                          fontSize: "12px",
                          fontWeight: "600",
                          color: "#666",
                          textTransform: "uppercase",
                          marginBottom: "4px",
                        }}
                      >
                        Confidence
                      </div>
                      <div
                        style={{
                          fontSize: "18px",
                          fontWeight: "700",
                        }}
                      >
                        {(selectedVisitor.confidence * 100).toFixed(1)}%
                      </div>
                      <div
                        style={{
                          marginTop: "4px",
                          height: "8px",
                          backgroundColor: "#e0e0e0",
                          borderRadius: "4px",
                          overflow: "hidden",
                        }}
                      >
                        <div
                          style={{
                            height: "100%",
                            width: `${selectedVisitor.confidence * 100}%`,
                            backgroundColor: selectedVisitor.recognized
                              ? "#4CAF50"
                              : "#FF9800",
                            transition: "width 0.3s ease",
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Detection Time */}
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#666",
                        textTransform: "uppercase",
                        marginBottom: "4px",
                      }}
                    >
                      Detected At
                    </div>
                    <div
                      style={{
                        fontSize: "14px",
                      }}
                    >
                      {selectedVisitor.detected_at
                        ? new Date(
                            selectedVisitor.detected_at._seconds
                              ? selectedVisitor.detected_at._seconds * 1000
                              : selectedVisitor.detected_at
                          ).toLocaleString("en-US", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          })
                        : "N/A"}
                    </div>
                  </div>

                  {/* Visitor ID */}
                  <div>
                    <div
                      style={{
                        fontSize: "12px",
                        fontWeight: "600",
                        color: "#666",
                        textTransform: "uppercase",
                        marginBottom: "4px",
                      }}
                    >
                      Detection ID
                    </div>
                    <div
                      style={{
                        fontSize: "12px",
                        color: "#999",
                        fontFamily: "monospace",
                        wordBreak: "break-all",
                      }}
                    >
                      {selectedVisitor.id}
                    </div>
                  </div>
                </div>

                {/* Close Button */}
                <button
                  onClick={() => setShowVisitorDetails(false)}
                  className="btn-control"
                  style={{
                    marginTop: "24px",
                    width: "100%",
                    backgroundColor: "#6c757d",
                    borderColor: "#6c757d",
                    padding: "12px",
                    fontSize: "14px",
                    fontWeight: "600",
                  }}
                >
                  CLOSE
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Volume Slider Styles & Animations */}
      <style jsx>{`
        @keyframes pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.3;
          }
        }

        .volume-slider::-webkit-slider-thumb {
          appearance: none;
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #4caf50;
          cursor: pointer;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .volume-slider::-webkit-slider-thumb:hover {
          background: #45a049;
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
          transform: scale(1.1);
        }

        .volume-slider::-webkit-slider-thumb:active {
          background: #3d8b40;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          transform: scale(0.95);
        }

        .volume-slider::-moz-range-thumb {
          width: 18px;
          height: 18px;
          border-radius: 50%;
          background: #4caf50;
          cursor: pointer;
          border: none;
          box-shadow: 0 2px 4px rgba(0, 0, 0, 0.2);
          transition: all 0.2s ease;
        }

        .volume-slider::-moz-range-thumb:hover {
          background: #45a049;
          box-shadow: 0 3px 6px rgba(0, 0, 0, 0.3);
          transform: scale(1.1);
        }

        .volume-slider::-moz-range-thumb:active {
          background: #3d8b40;
          box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
          transform: scale(0.95);
        }
      `}</style>
    </ProtectedRoute>
  );
}

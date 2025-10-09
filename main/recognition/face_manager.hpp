#pragma once

#include "human_face_recognition.hpp"
#include "dl_detect_define.hpp"
#include "dl_recognition_define.hpp"
#include "esp_log.h"
#include <string>
#include <map>
#include <vector>
#include <ctime>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

namespace who {
namespace recognition {

/**
 * Face information structure with name and enrollment timestamp
 */
struct FaceInfo {
    std::string name;
    std::string enrolled_timestamp;

    FaceInfo() : name("Unknown"), enrolled_timestamp("") {}
    FaceInfo(const std::string& n, const std::string& ts) : name(n), enrolled_timestamp(ts) {}
};

/**
 * Face recognition result with name
 */
struct FaceRecognitionResult {
    uint16_t id;
    std::string name;
    float similarity;

    FaceRecognitionResult() : id(0), name("Unknown"), similarity(0.0f) {}
    FaceRecognitionResult(uint16_t i, const std::string& n, float s) : id(i), name(n), similarity(s) {}
};

/**
 * Face Manager - Enhanced face recognition with name management
 *
 * Wraps HumanFaceRecognizer and adds:
 * - Face name management with persistence
 * - Delete any face by ID or name
 * - List all enrolled faces
 * - Rename faces
 * - Thread-safe operations
 */
class FaceManager {
public:
    /**
     * Constructor
     * @param db_path Path to face database file (e.g., "/spiffs/face.db")
     * @param names_json_path Path to face names JSON file (e.g., "/spiffs/face_names.json")
     * @param model_type Face feature model type
     * @param threshold Recognition similarity threshold (default 0.5)
     * @param top_k Number of top matches to return (default 1)
     */
    FaceManager(const char* db_path,
                const char* names_json_path,
                HumanFaceFeat::model_type_t model_type =
                    static_cast<HumanFaceFeat::model_type_t>(CONFIG_DEFAULT_HUMAN_FACE_FEAT_MODEL),
                float threshold = 0.5,
                int top_k = 1);

    ~FaceManager();

    /**
     * Enroll a new face with a name
     * @param img Image containing the face
     * @param detect_res Face detection results
     * @param name Name for the face (default: auto-generated "Person_N")
     * @return Face ID on success, 0 on failure
     */
    uint16_t enroll_face(const dl::image::img_t& img,
                        const std::list<dl::detect::result_t>& detect_res,
                        const std::string& name = "");

    /**
     * Recognize faces in an image
     * @param img Image containing faces
     * @param detect_res Face detection results
     * @return Vector of recognition results with names
     */
    std::vector<FaceRecognitionResult> recognize(const dl::image::img_t& img,
                                                const std::list<dl::detect::result_t>& detect_res);

    /**
     * Delete a face by ID
     * @param id Face ID to delete
     * @return ESP_OK on success, ESP_FAIL on failure
     */
    esp_err_t delete_face(uint16_t id);

    /**
     * Delete a face by name (deletes first match if multiple faces have same name)
     * @param name Face name to delete
     * @return ESP_OK on success, ESP_FAIL on failure
     */
    esp_err_t delete_face_by_name(const std::string& name);

    /**
     * Rename a face
     * @param id Face ID to rename
     * @param new_name New name for the face
     * @return ESP_OK on success, ESP_FAIL on failure
     */
    esp_err_t rename_face(uint16_t id, const std::string& new_name);

    /**
     * Get name for a face ID
     * @param id Face ID
     * @return Face name or "Unknown" if not found
     */
    std::string get_face_name(uint16_t id);

    /**
     * Get all enrolled faces
     * @return Vector of {id, name, timestamp} for all faces
     */
    std::vector<std::tuple<uint16_t, std::string, std::string>> get_all_faces();

    /**
     * Clear all enrolled faces (both database and names)
     * @return ESP_OK on success, ESP_FAIL on failure
     */
    esp_err_t clear_all_faces();

    /**
     * Get number of enrolled faces
     * @return Number of faces
     */
    int get_num_faces();

    /**
     * Get the underlying HumanFaceRecognizer (for advanced use)
     * @return Pointer to recognizer
     */
    HumanFaceRecognizer* get_recognizer() { return m_recognizer; }

private:
    HumanFaceRecognizer* m_recognizer;
    std::map<uint16_t, FaceInfo> m_face_names;
    std::string m_names_json_path;
    SemaphoreHandle_t m_mutex;

    // JSON persistence
    esp_err_t load_names_from_json();
    esp_err_t save_names_to_json();
    void sync_with_database();

    // Helper functions
    std::string generate_default_name();
    std::string get_current_timestamp();
    uint16_t get_last_enrolled_id();
};

} // namespace recognition
} // namespace who

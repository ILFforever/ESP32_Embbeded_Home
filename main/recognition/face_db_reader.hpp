#pragma once

#include "esp_err.h"
#include "human_face_recognition.hpp"
#include "esp_log.h"
#include <map>
#include <string>

namespace who {
namespace recognition {

/**
 * Face database manager with name support
 * Manages ESP-WHO face database and a separate name mapping table
 */
class FaceDbReader {
public:
    /**
     * Constructor
     * @param db_path Path to the face database file (e.g., "/storage/face.db")
     */
    FaceDbReader(const char* db_path);
    
    ~FaceDbReader();

    /**
     * Print all faces in the database to console
     */
    void print_all_faces();

    /**
     * Get the number of faces in database
     * @return Number of enrolled faces
     */
    int get_face_count();

    /**
     * Check if database exists and is valid
     * @return true if database is accessible
     */
    bool is_database_valid();

    /**
     * Reinitialize the database reader (use after database deletion/recreation)
     * This destroys the old recognizer and creates a new one
     */
    void reinitialize();

    /**
     * Delete name mapping for the last face ID
     * Call this when deleting the last enrolled face
     * @return ESP_OK on success
     */
    esp_err_t delete_last_name();

    /**
     * Delete name mapping for a specific face ID
     * @param id Face ID to delete (1-based)
     * @return ESP_OK on success, ESP_ERR_NOT_FOUND if ID not found
     */
    esp_err_t delete_name_by_id(int id);

    /**
     * Clear all name mappings and delete the names file
     * Call this when resetting the entire database
     * @return ESP_OK on success
     */
    esp_err_t clear_all_names();

    /**
     * Get name for a face ID
     * @param id Face ID (1-based)
     * @return Name string, or "(Un-named)" if not set
     */
    std::string get_name(int id);

    /**
     * Set name for a face ID
     * @param id Face ID (1-based)
     * @param name Name to assign
     * @return ESP_OK on success
     */
    esp_err_t set_name(int id, const char* name);

    /**
     * Trigger enrollment (via main recognition system event)
     * @param name Optional name for the enrolled face
     */
    void trigger_enroll(const char* name = nullptr);

private:
    HumanFaceRecognizer* m_recognizer;
    const char* m_db_path;
    std::map<int, std::string> m_name_table;
    char m_names_file_path[128];
    const char* m_pending_enroll_name;

    void cleanup_recognizer();
    bool init_recognizer();  // Returns true if successful
    bool ensure_initialized(); // Lazy init on first use

    // Name table management
    void load_name_table();
    void save_name_table();
    std::string get_names_file_path();
};

} // namespace recognition
} // namespace who
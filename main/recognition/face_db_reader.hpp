#pragma once

#include "esp_err.h"
#include "human_face_recognition.hpp"
#include "esp_log.h"

namespace who {
namespace recognition {

/**
 * Simple utility class to read and display ESP-WHO face database contents
 * This is a read-only class - it doesn't modify enrollment or recognition
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

private:
    HumanFaceRecognizer* m_recognizer;
    const char* m_db_path;

    void cleanup_recognizer();
    bool init_recognizer();  // Returns true if successful
    bool ensure_initialized(); // Lazy init on first use
};

} // namespace recognition
} // namespace who
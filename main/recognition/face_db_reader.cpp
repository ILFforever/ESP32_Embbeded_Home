#include "face_db_reader.hpp"
#include <sys/stat.h>
#include <cstring>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"

static const char* TAG = "FaceDbReader";

namespace who {
namespace recognition {

FaceDbReader::FaceDbReader(const char* db_path)
    : m_recognizer(nullptr), m_db_path(db_path)
{
    ESP_LOGI(TAG, "FaceDbReader created for database: %s (lazy initialization)", db_path);
    // Don't initialize recognizer yet - do it on first use
}

FaceDbReader::~FaceDbReader()
{
    cleanup_recognizer();
}

void FaceDbReader::cleanup_recognizer()
{
    if (m_recognizer) {
        ESP_LOGI(TAG, "Cleaning up recognizer");
        delete m_recognizer;
        m_recognizer = nullptr;
    }
}

bool FaceDbReader::init_recognizer()
{
    // Check if database file exists first
    struct stat st;
    if (stat(m_db_path, &st) != 0) {
        ESP_LOGD(TAG, "Database file does not exist yet: %s", m_db_path);
        return false;
    }

    // Create a copy of the path as HumanFaceRecognizer may modify it
    char* db_path_copy = strdup(m_db_path);

    // Initialize the recognizer to access the database
    // Using default model, threshold (0.55) and top_k (1)
    m_recognizer = new HumanFaceRecognizer(
        db_path_copy,
        static_cast<HumanFaceFeat::model_type_t>(CONFIG_DEFAULT_HUMAN_FACE_FEAT_MODEL),
        0.55f,
        1
    );

    if (!m_recognizer) {
        ESP_LOGE(TAG, "Failed to create HumanFaceRecognizer");
        return false;
    }

    ESP_LOGI(TAG, "FaceDbReader initialized successfully");
    return true;
}

bool FaceDbReader::ensure_initialized()
{
    // IMPORTANT: Always reload to get fresh data from disk
    // The main recognition system modifies the database file,
    // so we must create a fresh HumanFaceRecognizer each time to see changes
    cleanup_recognizer();

    // Initialize fresh recognizer that will read current database state
    return init_recognizer();
}

void FaceDbReader::print_all_faces()
{
    if (!ensure_initialized()) {
        ESP_LOGW(TAG, "Cannot print faces - database not available yet");
        return;
    }

    int face_count = m_recognizer->get_num_feats();
    
    ESP_LOGI(TAG, "===========================================");
    ESP_LOGI(TAG, "ESP-WHO Face Database Contents");
    ESP_LOGI(TAG, "Database Path: %s", m_db_path);
    ESP_LOGI(TAG, "===========================================");
    ESP_LOGI(TAG, "Total Enrolled Faces: %d", face_count);
    ESP_LOGI(TAG, "===========================================");
    
    if (face_count == 0) {
        ESP_LOGI(TAG, "No faces enrolled in database");
        return;
    }
    
    // ESP-WHO stores faces with sequential IDs starting from 1
    for (int i = 1; i <= face_count; i++) {
        ESP_LOGI(TAG, "Face ID: %d", i);
    }
    
    ESP_LOGI(TAG, "===========================================");
    ESP_LOGI(TAG, "Note: ESP-WHO uses sequential face IDs (1-%d)", face_count);
    ESP_LOGI(TAG, "Face features are stored as embeddings in the database");
    ESP_LOGI(TAG, "===========================================");
}

int FaceDbReader::get_face_count()
{
    if (!ensure_initialized()) {
        ESP_LOGD(TAG, "Cannot get face count - database not available yet");
        return 0;
    }

    return m_recognizer->get_num_feats();
}

bool FaceDbReader::is_database_valid()
{
    // Check if database file exists
    struct stat st;
    if (stat(m_db_path, &st) != 0) {
        ESP_LOGD(TAG, "Database file not found: %s", m_db_path);
        return false;
    }

    // Try to ensure recognizer is initialized
    return ensure_initialized();
}

void FaceDbReader::reinitialize()
{
    ESP_LOGI(TAG, "Resetting FaceDbReader (will lazy-init on next read)");
    cleanup_recognizer();
    // Don't immediately reinitialize - let it happen on next read
    // This allows ESP-WHO's enrollment system to create the database first
}

} // namespace recognition
} // namespace who
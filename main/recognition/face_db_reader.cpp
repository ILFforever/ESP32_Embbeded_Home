#include "face_db_reader.hpp"
#include <sys/stat.h>
#include <cstring>
#include <fstream>
#include <sstream>
#include <errno.h>
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "cJSON.h"

static const char* TAG = "FaceDbReader";

namespace who {
namespace recognition {

FaceDbReader::FaceDbReader(const char* db_path)
    : m_recognizer(nullptr), m_db_path(db_path), m_pending_enroll_name(nullptr)
{
    ESP_LOGI(TAG, "FaceDbReader created for database: %s (lazy initialization)", db_path);

    // Build names file path - use simple filename in same directory
    // Extract directory from db_path
    const char* last_slash = strrchr(db_path, '/');
    if (last_slash) {
        size_t dir_len = last_slash - db_path;
        strncpy(m_names_file_path, db_path, dir_len);
        m_names_file_path[dir_len] = '\0';
        strncat(m_names_file_path, "/names.txt", sizeof(m_names_file_path) - dir_len - 1);
    } else {
        snprintf(m_names_file_path, sizeof(m_names_file_path), "names.txt");
    }

    ESP_LOGI(TAG, "Names file path: %s", m_names_file_path);

    // Load existing name table
    load_name_table();

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

    // Initialize the recognizer to access the database
    // Using default model with lazy_load=false to load database immediately
    // Note: New API uses hardcoded threshold (0.5) and top_k (1)
    m_recognizer = new HumanFaceRecognizer(
        const_cast<char*>(m_db_path),
        static_cast<HumanFaceFeat::model_type_t>(CONFIG_DEFAULT_HUMAN_FACE_FEAT_MODEL),
        0.5f,  // threshold
        1      // top_k
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
    
    // Reload name table to get latest names
    load_name_table();

    // ESP-WHO stores faces with sequential IDs starting from 1
    for (int i = 1; i <= face_count; i++) {
        std::string name = get_name(i);
        ESP_LOGI(TAG, "Face ID: %d - %s", i, name.c_str());
    }

    ESP_LOGI(TAG, "===========================================");
    ESP_LOGI(TAG, "Note: ESP-WHO uses sequential face IDs (1-%d)", face_count);
    ESP_LOGI(TAG, "Face features are stored as embeddings in the database");
    ESP_LOGI(TAG, "Names stored in: %s", m_names_file_path);
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
    m_name_table.clear();
    load_name_table();
    // Don't immediately reinitialize - let it happen on next read
    // This allows ESP-WHO's enrollment system to create the database first
}

// ===========================================================================
// Name Table Management
// ===========================================================================

void FaceDbReader::load_name_table()
{
    m_name_table.clear();

    FILE* f = fopen(m_names_file_path, "r");
    if (!f) {
        ESP_LOGI(TAG, "No names file found (this is normal for first run)");
        return;
    }

    // Read entire file into buffer
    fseek(f, 0, SEEK_END);
    long fsize = ftell(f);
    fseek(f, 0, SEEK_SET);

    char* buffer = (char*)malloc(fsize + 1);
    if (!buffer) {
        ESP_LOGE(TAG, "Failed to allocate buffer for names file");
        fclose(f);
        return;
    }

    fread(buffer, 1, fsize, f);
    fclose(f);
    buffer[fsize] = '\0';

    // Parse JSON
    cJSON* root = cJSON_Parse(buffer);
    free(buffer);

    if (!root) {
        ESP_LOGW(TAG, "Failed to parse names file as JSON");
        return;
    }

    // Load name mappings
    cJSON* item = NULL;
    cJSON_ArrayForEach(item, root) {
        if (cJSON_IsObject(item)) {
            cJSON* id_obj = cJSON_GetObjectItem(item, "id");
            cJSON* name_obj = cJSON_GetObjectItem(item, "name");

            if (cJSON_IsNumber(id_obj) && cJSON_IsString(name_obj)) {
                int id = id_obj->valueint;
                const char* name = name_obj->valuestring;
                m_name_table[id] = std::string(name);
                ESP_LOGI(TAG, "Loaded: ID %d = %s", id, name);
            }
        }
    }

    cJSON_Delete(root);
    ESP_LOGI(TAG, "Loaded %d name mappings", m_name_table.size());
}

void FaceDbReader::save_name_table()
{
    cJSON* root = cJSON_CreateArray();

    for (const auto& pair : m_name_table) {
        cJSON* item = cJSON_CreateObject();
        cJSON_AddNumberToObject(item, "id", pair.first);
        cJSON_AddStringToObject(item, "name", pair.second.c_str());
        cJSON_AddItemToArray(root, item);
    }

    char* json_str = cJSON_Print(root);
    cJSON_Delete(root);

    if (!json_str) {
        ESP_LOGE(TAG, "Failed to serialize name table");
        return;
    }

    // Check if parent directory exists and is writable
    struct stat st;
    if (stat("/spiflash", &st) != 0) {
        ESP_LOGE(TAG, "Parent directory /spiflash does not exist!");
        free(json_str);
        return;
    }

    // Try opening with binary mode which is more compatible with FATFS
    FILE* f = fopen(m_names_file_path, "wb");
    if (!f) {
        // Get errno for detailed error
        ESP_LOGE(TAG, "Failed to open names file for writing: %s (errno: %d - %s)",
                 m_names_file_path, errno, strerror(errno));

        // Try to check file permissions if it exists
        if (stat(m_names_file_path, &st) == 0) {
            ESP_LOGW(TAG, "File exists but cannot open for writing. Size: %ld bytes", st.st_size);
        } else {
            ESP_LOGW(TAG, "File does not exist yet, attempting to create...");

            // Test if we can write to parent directory at all
            char test_path[128];
            snprintf(test_path, sizeof(test_path), "/spiflash/test.txt");
            FILE* test_f = fopen(test_path, "wb");
            if (test_f) {
                ESP_LOGI(TAG, "Successfully created test file - filesystem IS writable");
                fclose(test_f);
                remove(test_path);
            } else {
                ESP_LOGE(TAG, "Cannot create test file either (errno: %d) - filesystem may be read-only!", errno);
            }
        }

        free(json_str);
        return;
    }

    size_t written = fwrite(json_str, 1, strlen(json_str), f);
    if (written != strlen(json_str)) {
        ESP_LOGE(TAG, "Failed to write complete data. Expected: %d, Written: %d",
                 strlen(json_str), written);
    }

    fflush(f);  // Ensure data is written to disk
    fclose(f);
    free(json_str);

    ESP_LOGI(TAG, "Saved %d name mappings to %s", m_name_table.size(), m_names_file_path);
}

std::string FaceDbReader::get_name(int id)
{
    auto it = m_name_table.find(id);
    if (it != m_name_table.end()) {
        return it->second;
    }
    return "(Un-named)";
}

esp_err_t FaceDbReader::set_name(int id, const char* name)
{
    if (id < 1) {
        ESP_LOGE(TAG, "Invalid face ID: %d", id);
        return ESP_FAIL;
    }

    if (!name || strlen(name) == 0) {
        // Remove name if empty
        m_name_table.erase(id);
    } else {
        m_name_table[id] = std::string(name);
    }

    save_name_table();
    ESP_LOGI(TAG, "Set name for ID %d: %s", id, name ? name : "(removed)");
    return ESP_OK;
}

void FaceDbReader::trigger_enroll(const char* name)
{
    // Store pending name for after enrollment completes
    m_pending_enroll_name = name;

    // TODO: Trigger enrollment via button handler
    ESP_LOGI(TAG, "Enrollment triggered with name: %s", name ? name : "(none)");
}

std::string FaceDbReader::get_names_file_path()
{
    return std::string(m_names_file_path);
}

esp_err_t FaceDbReader::delete_last_name()
{
    // Get current face count from database
    if (!ensure_initialized()) {
        ESP_LOGW(TAG, "Database not available, cannot determine last face ID");
        // Still try to delete the highest ID in name table
    }

    int face_count = m_recognizer ? m_recognizer->get_num_feats() : 0;

    // After delete_last in ESP-WHO, the face_count will be one less
    // So we need to delete the name mapping for face_count + 1
    int id_to_delete = face_count + 1;

    // Check if this ID exists in name table
    auto it = m_name_table.find(id_to_delete);
    if (it != m_name_table.end()) {
        ESP_LOGI(TAG, "Deleting name for ID %d: %s", id_to_delete, it->second.c_str());
        m_name_table.erase(it);
        save_name_table();
        return ESP_OK;
    } else {
        ESP_LOGI(TAG, "No name mapping found for ID %d (this is OK if face was unnamed)", id_to_delete);
        return ESP_OK;
    }
}

esp_err_t FaceDbReader::clear_all_names()
{
    ESP_LOGI(TAG, "Clearing all name mappings");

    // Clear in-memory table
    m_name_table.clear();

    // Delete the names file
    int ret = remove(m_names_file_path);
    if (ret == 0) {
        ESP_LOGI(TAG, "Deleted names file: %s", m_names_file_path);
    } else {
        ESP_LOGW(TAG, "Could not delete names file (may not exist): %s", m_names_file_path);
    }

    return ESP_OK;
}

} // namespace recognition
} // namespace who
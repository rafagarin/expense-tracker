/**
 * Category service for the expense tracker
 * Handles dynamic loading of categories from the Settings sheet
 */

class CategoryService {
  constructor() {
    this.settingsSheet = null;
    this.categories = null;
    this.initializeSettingsSheet();
  }

  /**
   * Initialize the Settings sheet and load categories
   */
  initializeSettingsSheet() {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    this.settingsSheet = ss.getSheetByName('Settings');
    
    if (!this.settingsSheet) {
      throw new Error('Settings sheet not found. Please create a Settings sheet with categories.');
    }
    
    this.loadCategories();
  }

  /**
   * Load categories from the Settings sheet
   * Expected format:
   * - A3+: Category names
   * - B3+: Category descriptions
   */
  loadCategories() {
    try {
      const lastRow = this.settingsSheet.getLastRow();
      
      if (lastRow < 3) {
        throw new Error('No categories found in Settings sheet. Please add categories starting from row 3.');
      }

      // Get category data from A3 to the last row
      const categoryRange = this.settingsSheet.getRange(3, 1, lastRow - 2, 2);
      const categoryData = categoryRange.getValues();
      
      this.categories = {};
      
      categoryData.forEach((row, index) => {
        const categoryName = row[0];
        const categoryDescription = row[1];
        
        if (categoryName && categoryName.trim() !== '') {
          const key = categoryName.toUpperCase().replace(/[^A-Z0-9]/g, '_');
          this.categories[key] = {
            name: categoryName.trim(),
            description: categoryDescription ? categoryDescription.trim() : '',
            key: key
          };
        }
      });

      if (Object.keys(this.categories).length === 0) {
        throw new Error('No valid categories found in Settings sheet.');
      }

      Logger.log(`Loaded ${Object.keys(this.categories).length} categories from Settings sheet:`, Object.keys(this.categories));
      
    } catch (error) {
      Logger.log(`Error loading categories: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get all available categories
   * @returns {Object} Object with category keys and their details
   */
  getCategories() {
    if (!this.categories) {
      this.loadCategories();
    }
    return this.categories;
  }

  /**
   * Get category names as an array
   * @returns {Array} Array of category names
   */
  getCategoryNames() {
    const categories = this.getCategories();
    return Object.values(categories).map(cat => cat.name);
  }

  /**
   * Get category keys as an array (for validation)
   * @returns {Array} Array of category keys
   */
  getCategoryKeys() {
    const categories = this.getCategories();
    return Object.keys(categories);
  }

  /**
   * Get category details by name
   * @param {string} categoryName - The category name to look up
   * @returns {Object|null} Category details or null if not found
   */
  getCategoryByName(categoryName) {
    const categories = this.getCategories();
    return Object.values(categories).find(cat => cat.name === categoryName) || null;
  }

  /**
   * Get category details by key
   * @param {string} categoryKey - The category key to look up
   * @returns {Object|null} Category details or null if not found
   */
  getCategoryByKey(categoryKey) {
    const categories = this.getCategories();
    return categories[categoryKey] || null;
  }

  /**
   * Validate if a category name is valid
   * @param {string} categoryName - The category name to validate
   * @returns {boolean} True if valid, false otherwise
   */
  isValidCategory(categoryName) {
    return this.getCategoryNames().includes(categoryName);
  }

  /**
   * Refresh categories from the Settings sheet
   * Call this if categories have been updated
   */
  refreshCategories() {
    this.loadCategories();
    Logger.log('Categories refreshed from Settings sheet');
  }

  /**
   * Get categories for AI prompt (formatted for AI consumption)
   * @returns {string} Formatted string of categories and descriptions
   */
  getCategoriesForAIPrompt() {
    const categories = this.getCategories();
    const categoryList = Object.values(categories).map(cat => {
      if (cat.description) {
        return `- ${cat.name}: ${cat.description}`;
      } else {
        return `- ${cat.name}`;
      }
    }).join('\n');
    
    return categoryList;
  }
}

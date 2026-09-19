/**
 * Base discovery module — pattern used by theHarvester (discovery/*) and Recon-ng (modules).
 * Each source is one file exporting a Module with a standard run() contract.
 */

class BaseModule {
  /** Unique id used in UI and API (e.g. "maps", "directories") */
  static id = 'base';
  /** Human label */
  static label = 'Base';
  /** Short description */
  static description = '';
  /** Whether this module needs Playwright/browser */
  static needsBrowser = false;
  /** Optional paid API key env name */
  static apiKeyEnv = null;

  /**
   * @param {string} keyword  business category / search term
   * @param {string} location US location string
   * @param {{ onProgress?: Function, max?: number, skipIds?: string[] }} options
   * @returns {Promise<{ leads: object[], meta: object }>}
   */
  static async run(keyword, location, options = {}) {
    throw new Error(`${this.id}: run() not implemented`);
  }
}

module.exports = { BaseModule };

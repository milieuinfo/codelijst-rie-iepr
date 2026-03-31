'use strict';
import { skosOptions } from './utils/variables.js';
import { ConceptVersioning } from './utils/versioning.js';

(async () => {
  try {
    const versioner = new ConceptVersioning();
    const currentFile = skosOptions.jsonldOptions.file;
    const res = await versioner.init(currentFile);
    console.log('Initialized versioning for', res.updated, 'concepts in', currentFile);
  } catch (e) {
    console.error('Init versioning failed:', e.message);
    process.exit(1);
  }
})();

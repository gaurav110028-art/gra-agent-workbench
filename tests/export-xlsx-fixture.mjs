// Synthetic ZIP/XML fixture for the independent Python verifier. No files/logging.
import { sharedStringFixture, changeZip } from './xlsx-fixtures.mjs';
import { inspectXlsx, redactXlsx, detectXlsx } from '../lib/redactor/xlsx.mjs';
import { strToU8 } from 'fflate';
const input = inspectXlsx(changeZip(sharedStringFixture(), files => { files['docProps/core.xml'] = strToU8('<properties><author>SYNTHETIC_PRIVATE_AUTHOR</author></properties>'); }), 'synthetic.xlsx');
process.stdout.write(redactXlsx(input.model, detectXlsx(input.sheets, ['Aurora Advisory']), true));

/**
 * @file Application entry point. Importing these packages is what
 * registers the vl-* custom elements used throughout the app - there is no
 * separate "install" step for @domg-wc/components.
 */
import { VlButtonComponent } from '@domg-wc/components/atom/button/vl-button.component.js'
import { VlTextComponent } from '@domg-wc/components/atom/text/vl-text.component.js'
import { VlAlert } from '@domg-wc/components/block/alert/vl-alert.component.js'
import { VlInputFieldComponent } from '@domg-wc/components/form/input-field/vl-input-field.component.js'
import { VlTextareaComponent } from '@domg-wc/components/form/textarea/vl-textarea.component.js'
import { VlSelectComponent } from '@domg-wc/components/form/select/vl-select.component.js'
import { VlSelectRichComponent } from '@domg-wc/components/form/select-rich/vl-select-rich.component.js'
import { VlCheckboxComponent } from '@domg-wc/components/form/checkbox/vl-checkbox.component.js'
import { VlDatepickerComponent } from '@domg-wc/components/form/datepicker/vl-datepicker.component.js'
import { VlFieldsetComponent } from '@domg-wc/components/form/fieldset/vl-fieldset.component.js'
import { VlFormLabelComponent } from '@domg-wc/components/form/form-label/vl-form-label.component.js'
import { VlFormMessageComponent } from '@domg-wc/components/form/form-message/vl-form-message.component.js'

// Ensure unused imports are not tree-shaken by the build tool
const _vlRefs = [
  VlButtonComponent,
  VlTextComponent,
  VlAlert,
  VlInputFieldComponent,
  VlTextareaComponent,
  VlSelectComponent,
  VlSelectRichComponent,
  VlCheckboxComponent,
  VlDatepickerComponent,
  VlFieldsetComponent,
  VlFormLabelComponent,
  VlFormMessageComponent,
]
console.debug('[structuur-app] vl-* components loaded:', _vlRefs.length)
import './components/index.ts'

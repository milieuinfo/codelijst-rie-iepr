/**
 * @file Application entry point. Importing these packages registers the vl-*
 * custom elements used on the landing page - there is no separate install step.
 */
import { VlButtonComponent } from '@domg-wc/components/atom/button/vl-button.component.js'
import { VlTextComponent } from '@domg-wc/components/atom/text/vl-text.component.js'

// Ensure unused imports are not tree-shaken by the build tool
const _vlRefs = [VlButtonComponent, VlTextComponent]
console.debug('[poc-landing] vl-* components loaded:', _vlRefs.length)

import './components/landing-app.ts'

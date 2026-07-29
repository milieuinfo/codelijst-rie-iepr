# Issues/changes reported during testing
- when xsd:boolean is used a checkbox is shown, but the prefLabel is missing next to the checkbox
- For units; relevantUnit, the label should be fetched remotely (rdfs:label), maybe make a configurable whitelist that resolves online based on the base URI
- If a relevantRiepr is used on the conceptscheme like is the case with "Controleinrichting", then the children should not show unless something is selected first since the "Lozing" applies to the selected controleinrichting.
- the condition: riepr-operationeel-grondstoffen:geproduceerd	true does not work, even when the checkbox is false it shows
- relevantRiepr on some items like on riepr-operationeel-lucht:brandstof indicate that you should first select a "emissie procedure" (link between installation and emissiepunt). check the datavoorbeelden outlined in the project outline for more info
- I am missing clear Dutch documentation that shows how I should read the code lists and what should be application logic (vs logic baked into the code lists)

# codelijst-rie-iepr: Proof of Concept

## Description
This is a proof of concept Web UI application built with typescript, nodejs and web components. It demonstrates how codelists are read and understood. This README serves as a documentation for AI agents to plan and distribute the work. The proof of concept is limited to the operational data (i.e. entering observations on previously reported installations, emission points, ...).

## Planning instructions
You are the techlead responsible for creating a proof of concept to demonstrate the codelists for the RIE-IEPR project. First read the project outline. Create epics in the ./pocs/docs/tasks/* directory that are sorted by priority and created as a directory with a DESCRIPTION.md file inside that follows a common template with AS IS, TO BE and DOD (Definition of done). Clearly outline what is in scope and what is not. Epics can have sub directories with subtasks that can include both research and implementation tasks. All agents are encouraged to search online to enrich their knowledge.

Distribute every task to subagents. Subagents can create subtasks or new major tasks where needed that are then picked up by the techlead to distribute.

After each task, research or implementation - delegate to a subagent to review the changes or findings. The feedback is then provided back to the subagents to fix the implementation if needed. After every change, ensure that the project runs and builds. Reviewers should check that the code fits in the general project scope and also are not too overengineered or inconsistent with the existing codebase.

Reviewer feedback and any other documentation related to a task should be placed alongside the DESCRIPTION.md in the same 'task directory'. Once the website is functional, there should be working validation that ensures that the web pages load correctly without javascript or HTML errors. If there are errors, new tasks should be created with a high priority to fix this.

Your work is done once all tasks are completed.

## Guardrails
- Only work in the ./poc directory. The rest of the repository is out of scope. Do not modify any files outside of this directory.
- Use the existing flux-web-components (vl-*) components as much as possible. Avoid custom CSS and components unless absolutely necessary.
- Use the existing codelists in ./src/man/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld. Do not create new codelists or modify existing ones.
- Base yourself on the existing data model https://github.com/milieuinfo/RIE-IEPR

## Requirements and user flow
### Functional requirements
- Read the code list(s) from ./src/man/be/vlaanderen/omgeving/data/id/conceptscheme/rie-iepr/rie-iepr.jsonld
- Ensure generic code for reading the lists
- The code should work without a backend (no persistence needed)

### Non-functional requirements
- Dutch/Vlaams as the language of the POC
- Vlaanderen style as outlined by flux-web-components documentation using vl-* components (documented here: https://flux.omgeving.vlaanderen.be/release-v2/2.16.0/storybook/?path=/docs/changelog--documentatie).
- Prevent custom CSS and try to use existing vl-* components
- Dummy data for necesarry information. Take note of the data model and data examples (e.g. AGC Glass) from https://github.com/milieuinfo/RIE-IEPR

### Technical requirements
- NodeJS 25, TypeScript 7 and web components
- Lit with web components
- JSDoc and linting to ensure code documentation consistency
- Generic approach to reading code lists from JSON-LD files
- Use flux components (Vlaanderen) to create the UI https://github.com/milieuinfo/flux-web-components
- Quick cypress tests to validate that everything loads

### Out of scope
- Persistence, this is mainly a demonstration on how the code lists are interpreted to visualise the available selections and user flow.
- Security
- Error hardening and any other production ready feature/implementation that is beyond the need of this proof of concept.
- Elaborage e2e and unit tests, this is a proof of concept

### User flow (MVP)
1. The user selects a theme from the code list `thema-type`. The label of this box is the conceptscheme preflabel
    - If a thema has a narrower relation (children) also show a selection for the sub-choice
2. Once selected, the `relevantRiepr` directs to the conceptscheme that outlines the user flow (e.g. `operationeel-lucht`).
3. Other than the narrower/broader relation for thema, the narrower/broader relation in operationeel-* indicates the composite attributes for a particular question. E.g., `riepr-operationeel-lucht:verbruikte_stof` has an 'Aard' and other settings that are being asked.
4. The relevantDataType indicates the field type (number, string, ...); if relevantCodeList is used than it references another conceptscheme that should be shown in a selection box. In some cases this is still marked as TODO or the URI is inacessible, in this case silently ignore this error but still show a selection
5. `isVerplicht` indicates that something is required, `isMeervoudig` indicates that the 'question' data can be asked multiple times - in which case there should be an option to add multiple of these items (e.g. multiple 'verbruikte stoffen')
6. `relevantRiepr` in operationeel-* indicates the structural elements that should be search in the (non-existing) database. E.g., `riepr-meetpunt-type:debietmeter` means you should show a list of 'Debietmeters' so these should be available as mock data. Again, look at the non-functional requirements for more information about the dummy data.

> NOTES: In case the code lists lack information (e.g. a missing data type, ...) that limit the quality of the POC report these issues in ISSUES.md in the ./poc/docs directory

Be prepared that new user flows will be communicated at a later date so the code should be generic enough to support this. Create an AGENTS.md file (and multiple if needed to have more details in specific directories) explaining the code, the architecture and how changes should be handled. Subagents and other agents that work on a task should maintain these documentation files.

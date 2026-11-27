export interface CubePathStep {
    predicate: string;
    inverse?: boolean;
}
export interface CubeProperty {
    predicate: string;
    role: 'dimension' | 'measure' | 'attribute';
    range?: string;
    path?: CubePathStep[];
    label?: string;
}
export interface CubeProfile {
    ontology: { source: string; sha256: string };
    properties: CubeProperty[];
    sharedContext: string[];
    dataset: { className: string; template: string; mappings: Record<string, string> };
}
export interface CubeReportContext {
    report: string;
    year: number;
    created: string;
    issued: string;
}
export const cubeProfile: CubeProfile;
export const cubeRoles: Map<string, CubeProperty['role']>;
export function resultDsd(source: string): string;
export function resultDataset(dsd: string, context: CubeReportContext): {
    id: string;
    className: string;
    values: Record<string, { value: string; datatype?: string }>;
};

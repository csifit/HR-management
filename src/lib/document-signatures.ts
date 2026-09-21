// Integration boundary: no signature provider is configured in this release.
export interface DocumentSignatureProvider {
  available: boolean;
  requestSignature(documentId: string): Promise<never>;
}
export const documentSignatureProvider: DocumentSignatureProvider = {
  available: false,
  async requestSignature() { throw new Error("Electronic signing is not configured."); },
};

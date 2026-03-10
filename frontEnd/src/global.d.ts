export {};

type ListOpts = { limit?: number; offset?: number; q?: string };
type BanksListOpts = { limit?: number; offset?: number };
type AssetsListOpts = { limit?: number; offset?: number; status?: string; asset_class?: string; q?: string };

export type Endpoints = {
  assets?: {
    list?: (companyId: number | string, opts?: AssetsListOpts) => string;
    create?: (companyId: number | string) => string;
    get?: (companyId: number | string, assetId: number | string) => string;
    update?: (companyId: number | string, assetId: number | string) => string;

    // optional for later
    createAcquisition?: (companyId: number | string, assetId: number | string) => string;
  };
  coa?: {
    list?: (companyId: number | string) => string;
  };
  vendors?: {
    list?: (companyId: number | string, opts?: ListOpts) => string;
  };
  banks?: {
    list?: (companyId: number | string, opts?: BanksListOpts) => string;
  };
  // add more modules later as needed
};

declare global {
  interface Window {
    apiFetch?: (url: string, opts?: RequestInit) => Promise<unknown>;
    ENDPOINTS?: Endpoints;
  }
}

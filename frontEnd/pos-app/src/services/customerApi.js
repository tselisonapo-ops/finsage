import { posApi } from "./posApi.js";

export const customerApi = {
  list(q = "") {
    return posApi.listCustomers(q);
  },

  create(payload) {
    return posApi.createCustomer(payload);
  },
};
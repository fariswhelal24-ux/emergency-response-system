import { Request, Response } from "express";

import { responderService } from "./responder.service.js";

export const responderController = {
  listAll: async (_request: Request, response: Response): Promise<void> => {
    const responders = await responderService.listAllResponders();

    response.json({
      data: responders
    });
  }
};

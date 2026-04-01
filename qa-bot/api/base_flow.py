from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from core.client import ApiClient
from core.db import DB
from core.logger import logger, log_event


class BaseFlow(ABC):
    def __init__(self, client: ApiClient, db: DB, company_id: int) -> None:
        self.client = client
        self.db = db
        self.company_id = company_id
        self.state: dict[str, Any] = {}

    @property
    @abstractmethod
    def name(self) -> str:
        raise NotImplementedError

    def setup(self) -> None:
        logger.info("[%s] setup", self.name)
        log_event("flow_setup", flow=self.name)

    @abstractmethod
    def run(self) -> dict[str, Any]:
        raise NotImplementedError

    def verify(self) -> None:
        logger.info("[%s] verify", self.name)
        log_event("flow_verify", flow=self.name)

    def cleanup(self) -> None:
        logger.info("[%s] cleanup", self.name)
        log_event("flow_cleanup", flow=self.name)

    def execute(self) -> dict[str, Any]:
        self.setup()
        try:
            result = self.run()
            self.verify()
            log_event("flow_success", flow=self.name, state=self.state)
            return result
        except Exception as exc:
            log_event("flow_failure", flow=self.name, error=str(exc), state=self.state)
            raise
        finally:
            self.cleanup()
from pydantic_settings import BaseSettings, SettingsConfigDict
from pathlib import Path


_DEFAULT_SYMBOLS_PATH = str(Path(__file__).parent.parent / "symbols")


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    symbols_path: str = _DEFAULT_SYMBOLS_PATH
    allowed_origins: str = "http://localhost:3000,http://localhost:5173,https://spd-fe-2.app.tc1.airbase.sg"
    app_version: str = "1.0.0"

    @property
    def symbols_dir(self) -> Path:
        return Path(self.symbols_path)

    @property
    def default_symbols_dir(self) -> Path:
        return self.symbols_dir / "default"

    @property
    def custom_symbols_dir(self) -> Path:
        return self.symbols_dir / "custom"

    @property
    def manifest_path(self) -> Path:
        return self.symbols_dir / "manifest.json"

    @property
    def origins_list(self) -> list[str]:
        return [o.strip() for o in self.allowed_origins.split(",")]


settings = Settings()

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    # LLM
    anthropic_api_key: str = ""
    gemini_api_key: str = ""
    llm_model: str = "gemini-3.6-flash"

    # Database
    database_url: str = "sqlite:///./drmood.db"

    # Vector store
    chroma_persist_dir: str = "./chroma_store"
    chroma_collection: str = "clinical_sources"

    # Embeddings
    embedding_model: str = "all-MiniLM-L6-v2"

    # Retrieval
    retrieval_top_k: int = 4
    retrieval_min_score: float = 0.35

    # CORS
    cors_origins: str = "http://localhost:5500,http://127.0.0.1:5500"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
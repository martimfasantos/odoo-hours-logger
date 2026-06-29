import app.env_file as ef


def test_read_env_missing_file_returns_empty(tmp_path, monkeypatch):
    monkeypatch.setattr(ef, "ENV_PATH", tmp_path / "nonexistent.env")
    assert ef.read_env() == {}


def test_read_env_parses_key_value_pairs(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text(
        "# A comment\n"
        "ODOO_URL=https://example.com\n"
        "ODOO_DB=mydb\n"
        "\n"
        "DEMO_MODE=true\n"
    )
    monkeypatch.setattr(ef, "ENV_PATH", path)
    result = ef.read_env()
    assert result == {
        "ODOO_URL": "https://example.com",
        "ODOO_DB": "mydb",
        "DEMO_MODE": "true",
    }


def test_write_env_updates_existing_key(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("ODOO_SESSION_ID=old\nODOO_DB=mydb\n")
    monkeypatch.setattr(ef, "ENV_PATH", path)

    ef.write_env({"ODOO_SESSION_ID": "newtoken"})

    content = path.read_text()
    assert "ODOO_SESSION_ID=newtoken" in content
    assert "ODOO_SESSION_ID=old" not in content
    # Unrelated key preserved
    assert "ODOO_DB=mydb" in content


def test_write_env_appends_missing_key(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("ODOO_DB=mydb\n")
    monkeypatch.setattr(ef, "ENV_PATH", path)

    ef.write_env({"NEW_KEY": "somevalue"})

    content = path.read_text()
    assert "NEW_KEY=somevalue" in content
    assert "ODOO_DB=mydb" in content


def test_write_env_preserves_comments_and_ordering(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    original = (
        "# Settings file\n"
        "ODOO_URL=https://old.example.com\n"
        "# Another comment\n"
        "ODOO_DB=mydb\n"
    )
    path.write_text(original)
    monkeypatch.setattr(ef, "ENV_PATH", path)

    ef.write_env({"ODOO_URL": "https://new.example.com"})

    lines = path.read_text().splitlines()
    assert lines[0] == "# Settings file"
    assert lines[1] == "ODOO_URL=https://new.example.com"
    assert lines[2] == "# Another comment"
    assert lines[3] == "ODOO_DB=mydb"


def test_write_env_creates_file_if_missing(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    monkeypatch.setattr(ef, "ENV_PATH", path)

    ef.write_env({"DEMO_MODE": "false"})

    assert path.exists()
    assert "DEMO_MODE=false" in path.read_text()


def test_read_write_roundtrip(tmp_path, monkeypatch):
    path = tmp_path / ".env"
    path.write_text("KEY_A=val_a\nKEY_B=val_b\n")
    monkeypatch.setattr(ef, "ENV_PATH", path)

    original = ef.read_env()
    ef.write_env({"KEY_A": "updated"})
    updated = ef.read_env()

    assert updated["KEY_A"] == "updated"
    assert updated["KEY_B"] == original["KEY_B"]


def test_env_path_resolves_under_app_data_dir():
    from app import env_file
    from app.paths import app_data_dir

    assert env_file.ENV_PATH == app_data_dir() / ".env"

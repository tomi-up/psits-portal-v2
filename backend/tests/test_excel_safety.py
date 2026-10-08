"""Excel exports write student-submitted free text (e.g. survey comments)
straight into cells. Without this guard, a comment starting with =, +, -,
or @ gets interpreted as a formula by Excel/LibreOffice/Sheets on open -
spreadsheet formula injection."""

from app.services.excel_safety import safe_cell_value


class TestSafeCellValue:
    def test_prefixes_formula_trigger_characters(self):
        assert safe_cell_value("=1+1") == "'=1+1"
        assert safe_cell_value("+1+1") == "'+1+1"
        assert safe_cell_value("-1+1") == "'-1+1"
        assert safe_cell_value("@SUM(A1:A2)") == "'@SUM(A1:A2)"

    def test_leaves_ordinary_text_unchanged(self):
        assert safe_cell_value("Great event!") == "Great event!"
        assert safe_cell_value("") == ""

    def test_leaves_non_strings_unchanged(self):
        assert safe_cell_value(42) == 42
        assert safe_cell_value(None) is None
        assert safe_cell_value(3.5) == 3.5

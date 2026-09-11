"""Fixed post-event survey questions, transcribed from private_data/survey_questions.docx
(the org's standard Activity Evaluation Form). Shared by the survey endpoints
for both serving the question set to the frontend and validating submissions."""

RATING_SCALE = [
    {"value": 4, "label": "Strongly Agree"},
    {"value": 3, "label": "Agree"},
    {"value": 2, "label": "Disagree"},
    {"value": 1, "label": "Strongly Disagree"},
]

SURVEY_SECTIONS = [
    {
        "title": "Objectives & Relevance of the Activity",
        "questions": [
            {"id": "1.1", "text": "The objectives of the activity were clearly introduced/evident."},
            {"id": "1.2", "text": "The objectives and themes of the activity were relevant."},
            {"id": "1.3", "text": "The activity/ies or topic/s were useful to the participants."},
            {"id": "1.4", "text": "The activity/ies or topic/s offered lifelong lessons that promotes personal growth."},
        ],
    },
    {
        "title": "Organization and Preparation of the Activity",
        "questions": [
            {"id": "2.1", "text": "The activity was well-prepared and systematically done."},
            {"id": "2.2", "text": "The activity was conducted in favorable venue (ventilation, lighting, equipment, and facilities)."},
            {"id": "2.3", "text": "The activity started and ended on time."},
            {"id": "2.4", "text": "The pacing of activities was appropriate."},
        ],
    },
    {
        "title": "Information Dissemination",
        "questions": [
            {"id": "3.1", "text": "There was a public information dissemination about the conduct of the activity."},
        ],
    },
    {
        "title": "Facilitators",
        "questions": [
            {"id": "4.1", "text": "The program facilitators were accommodating."},
            {"id": "4.2", "text": "The facilitators demonstrated appropriate personal and professional behavior."},
            {"id": "4.3", "text": "The facilitators acknowledged comments explicitly."},
            {"id": "4.4", "text": "The facilitators avoided being prescriptive and overly directive, instead guided participants."},
        ],
    },
    {
        "title": "Speaker (if applicable)",
        "questions": [
            {"id": "5.1", "text": "The speaker exhibited expertise in the field."},
            {"id": "5.2", "text": "The speaker used effective means of communicating ideas."},
            {"id": "5.3", "text": "The speaker was keen and had interest in the conduct of the training."},
            {"id": "5.4", "text": "The speaker stimulated the participants' interest."},
        ],
    },
]

QUESTION_IDS = [q["id"] for section in SURVEY_SECTIONS for q in section["questions"]]


def validate_answers(answers: dict) -> str | None:
    """Returns an error message, or None if valid. Every question must be
    answered with a rating from 1-4; "comments" is optional free text."""
    for qid in QUESTION_IDS:
        value = answers.get(qid)
        if value not in (1, 2, 3, 4):
            return f"Question {qid} must be answered with a rating from 1 to 4"

    comments = answers.get("comments")
    if comments is not None and not isinstance(comments, str):
        return "Comments must be text"

    return None

from config import PROMPT_EXAMPLES
from services.LLM.generate_answer import generate_answer
from services.optional_prompt.prompts import (
    SYSTEM_PROMPT_ERROR_JP,
    # SYSTEM_PROMPT_ERROR_EN,
    SYSTEM_PROMPT_SUMMARY_JP,
    SYSTEM_PROMPT_MOST_VISIT_JP,
)
import streamlit as st
import pandas as pd
from services.search_data.error_list_search import get_error_details
from services.search_data.log_search import search_data
from services.update_chat import update_chat_history
from services.search_data.manual_vector_search import search_vector_store



def execute_optional_prompt(prompt_id):
    """Execute the selected optional prompt."""
    st.session_state.waiting_for_user_id = True
    st.session_state.selected_prompt_id = prompt_id
    update_chat_history(f"{PROMPT_EXAMPLES[prompt_id]}", "user")
    update_chat_history("Please provide a user ID.", "ai")


# def display_user_info(user_id):
#     """Display user information based on the provided user ID."""
#     relevant_data = search_data(user_id, LOG_DATA)
#     # Get the user's error data for log(only first error)
#     search_error_data = relevant_data[
#         relevant_data["Processing Result"].str.contains("エラー")
#     ].head(1)

#     if not relevant_data.empty:
#         log_context = " ".join(relevant_data.astype(str).values.flatten())
#         # error_summary = extract_error_summary(search_error_data)
#         error_message = get_error_details(search_error_data, ERROR_LIST_DATA)
#         error_handling_context = search_vector_store(
#             error_message, st.session_state.vector_store
#         )
#         prompt = SYSTEM_PROMPT_ERROR_JP.format(
#             # prompt = SYSTEM_PROMPT_ERROR_EN.format(
#             context=log_context,
#             error_handling_context=error_handling_context,
#             error_message=error_message,
#         )
#         answer = generate_answer(prompt, model=st.session_state.selected_model)
#         update_chat_history(f"{answer}", "ai")
#     else:
#         update_chat_history("No information found for the provided user ID.", "ai")


# def display_user_summary(user_id):
#     """Display user summary based on the provided user ID."""
#     relevant_data = search_data(user_id, LOG_DATA)
#     if not relevant_data.empty:
#         context = " ".join(relevant_data.astype(str).values.flatten())
#         prompt = SYSTEM_PROMPT_SUMMARY_JP.format(context=context)
#         answer = generate_answer(prompt, model=st.session_state.selected_model)
#         update_chat_history(f"{answer}", "ai")
#     else:
#         update_chat_history("No information found for the provided user ID.", "ai")


# def display_user_viewed_pages(user_id):
#     """Display user's most viewed pages based on the provided user ID."""
#     relevant_data = search_data(user_id, LOG_DATA)
#     if not relevant_data.empty:
#         context = " ".join(relevant_data.astype(str).values.flatten())
#         prompt = SYSTEM_PROMPT_MOST_VISIT_JP.format(context=context)
#         answer = generate_answer(prompt, model=st.session_state.selected_model)
#         update_chat_history(f"{answer}", "ai")
#     else:
#         update_chat_history("No information found for the provided user ID.", "ai")

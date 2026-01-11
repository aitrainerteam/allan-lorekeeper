import streamlit as st
import openai
import re
import os
from dotenv import load_dotenv

# --- CONFIGURATION ---
# Load environment variables from .env file
load_dotenv()

# Initialize OpenAI client (will use OPENAI_API_KEY from .env or environment)
client = openai.Client()

# --- DOCUMENT LOADER & PARSER ---
def load_and_parse_document(file_content):
    """
    Parses the specific structure of your 'Ways of Men and Nature' document.
    Splits into: World, Metaphysics, Characters, Story Beats, Problems, Ideas, etc.
    """
    # Define regex patterns for your headers
    # Matches "I. Title", "IV. Title", "Problems", "Ideas", "Characters"
    patterns = [
        r"(I\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(II\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(III\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(IV\.\s.*?)(?=\n[IV]+\.|Problems|Ideas|Characters|$)",
        r"(Problems)(?=\n[IV]+\.|Ideas|Characters|$)",
        r"(Ideas)(?=\n[IV]+\.|Problems|Characters|$)",
        r"(Characters)(?=\n[IV]+\.|Problems|Ideas|World|$)",
        r"(World)(?=\n[IV]+\.|Problems|Ideas|Characters|$)"
    ]
    
    sections = {}
    remaining_text = file_content
    
    # Simple keyword splitting for your specific layout
    # We map the keywords to friendlier names
    markers = {
        "I. ": "I. The World",
        "II. ": "II. Metaphysical System",
        "III. ": "III. Characters",
        "IV. ": "IV. Story Beats",
        "Problems": "Issues/Problems",
        "Ideas": "Ideas",
        "Characters": "Character Profiles",
        "World": "World Building"
    }

    # Iterate and split text
    # Note: A robust parser splits by finding indices of headers. 
    # For this simple version, we find the content between headers.
    
    # Let's use a simpler split strategy based on your unique headers
    split_pattern = r"(^I\..*|^II\..*|^III\..*|^IV\..*|^Problems|^Ideas|^Characters|^World)"
    parts = re.split(split_pattern, file_content, flags=re.MULTILINE)
    
    current_header = "Intro/Uncategorized"
    if parts:
        sections[current_header] = parts[0].strip()
        
    for i in range(1, len(parts), 2):
        header = parts[i].strip()
        content = parts[i+1].strip() if i+1 < len(parts) else ""
        
        # Clean up header name
        display_name = header
        for key, val in markers.items():
            if header.startswith(key) or header == key:
                display_name = val
                break
        
        sections[display_name] = content

    return sections

# --- BACKEND: OPENAI INTERFACE ---
def edit_section(full_context, section_text, user_instructions):
    """
    Sends the request to OpenAI.
    Strategy: 
    1. System Prompt = ENTIRE DOCUMENT (Cached by OpenAI if static).
    2. User Prompt = Specific Section + Instructions.
    """
    
    system_prompt = f"""
    You are an expert novel editor and writing assistant.
    
    BELOW IS THE ENTIRE CONTEXT OF THE NOVEL PROJECT "THE WAYS OF MEN AND NATURE".
    READ IT TO UNDERSTAND THE WORLD, TONE, AND PLOT.
    
    --- START CONTEXT ---
    {full_context}
    --- END CONTEXT ---
    
    YOUR TASK:
    The user will provide a specific SECTION to edit and INSTRUCTIONS.
    You must:
    1. Analyze how the changes fit the global context (tone, established facts).
    2. Rewrite the section based on the instructions.
    3. Output ONLY the rewritten section.
    """

    user_message = f"""
    --- CURRENT SECTION TEXT ---
    {section_text}
    ----------------------------
    
    INSTRUCTIONS:
    {user_instructions}
    """

    response = client.chat.completions.create(
        model="gpt-4o", # Use gpt-4o or gpt-4-turbo for better context handling
        messages=[
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_message}
        ],
        temperature=0.7
    )
    
    return response.choices[0].message.content

# --- FRONTEND: STREAMLIT ---
def main():
    st.set_page_config(layout="wide", page_title="Novel Editor")
    st.title("Incremental Novel Editor")

    # 1. Load Document (Ideally this loads from your local file)
    # For this script, pasting the path or content. 
    # In production, use: with open("The Ways of Men and Nature.docx", "r") as f: content = f.read()
    
    st.sidebar.header("Document Source")
    # File uploader for convenience, or hardcode your path
    uploaded_file = st.sidebar.file_uploader("Upload your document (.txt or copy-paste content)", type=["txt", "md"])
    
    if "full_text" not in st.session_state:
        # Default placeholder or load from local path if you prefer
        st.session_state["full_text"] = ""

    if uploaded_file is not None:
        stringio = uploaded_file.getvalue().decode("utf-8")
        st.session_state["full_text"] = stringio
    elif st.session_state["full_text"] == "":
        st.warning("Please upload the document text file on the sidebar to begin.")
        st.stop()

    # 2. Parse Document
    sections = load_and_parse_document(st.session_state["full_text"])
    
    # 3. Sidebar Selection
    section_keys = list(sections.keys())
    selected_section_name = st.sidebar.radio("Select Section to Edit", section_keys)
    
    # 4. Main Editing Interface
    st.subheader(f"Editing: {selected_section_name}")
    
    col1, col2 = st.columns(2)
    
    with col1:
        st.markdown("### Original Text")
        # Text Area for the content of the section
        current_text = st.text_area(
            "Content", 
            value=sections[selected_section_name], 
            height=600,
            key="current_editor"
        )
        
    with col2:
        st.markdown("### AI Editor")
        instructions = st.text_area("Instructions for this section", placeholder="e.g., Make the dialogue more tense, fix plot hole regarding the comet...")
        
        if st.button("Generate Revision"):
            with st.spinner("AI is reading context and rewriting..."):
                try:
                    # We pass the ORIGINAL full text as context to ensure consistency
                    # But we edit the 'current_text' (in case you made manual changes)
                    new_version = edit_section(
                        st.session_state["full_text"], 
                        current_text, 
                        instructions
                    )
                    st.session_state["last_revision"] = new_version
                except Exception as e:
                    st.error(f"Error: {e}")

        if "last_revision" in st.session_state:
            st.markdown("#### Suggested Revision")
            st.code(st.session_state["last_revision"], language="markdown")
            
            if st.button("Accept Revision"):
                # Update the section in memory
                sections[selected_section_name] = st.session_state["last_revision"]
                # Reconstruct full text (naive reconstruction)
                new_full_text = ""
                for k, v in sections.items():
                    if k == "Intro/Uncategorized":
                        new_full_text += v + "\n\n"
                    else:
                        # Map back to original headers if needed, or just append
                        # This is a simple append for now
                        header_map = {v: k for k, v in {"I. The World": "I. ", "II. Metaphysical System": "II. ", "III. Characters": "III. ", "IV. Story Beats": "IV. ", "Issues/Problems": "Problems", "Ideas": "Ideas", "Character Profiles": "Characters", "World Building": "World"}.items()}
                        original_header = header_map.get(k, k)
                        new_full_text += f"{original_header}\n{v}\n\n"
                
                st.session_state["full_text"] = new_full_text
                st.success("Updated! Please download the result or continue editing.")
                st.rerun()

if __name__ == "__main__":
    main()
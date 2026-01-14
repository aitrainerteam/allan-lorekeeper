# LoreKeeper

A local-first web application for fiction writers to organize and manage their creative works. Built with FastAPI, SQLModel, and modern web technologies.

## Features

- **Codex Management**: Organize Characters, Concepts, and Acts
- **Timeline Tools**: Create and manage story timelines with AI-powered synthesis and alignment
- **Plot Hole Tracking**: Identify and manage unsolved problems in your stories
- **Story Oracle**: AI-powered chat interface with RAG (Retrieval-Augmented Generation) over your local content
- **Interactive Map**: Visual story mapping with drag-and-drop interface
- **Bible Editor**: AI-assisted story bible editing and management

## Architecture

- **Backend**: FastAPI with SQLModel (SQLite database)
- **Frontend**: HTML templates with HTMX for dynamic interactions
- **AI Integration**: OpenAI API for intelligent content assistance
- **Map Component**: React/TypeScript application for visual story mapping
- **Local-First**: All data stored locally in SQLite database

## Quick Start

### Prerequisites

- Python 3.8+
- Node.js 16+ (for the map component)
- OpenAI API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <your-repo-url>
   cd lorekeeper
   ```

2. **Set up Python environment**
   ```bash
   # Create virtual environment
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate

   # Install dependencies
   pip install -r requirements.txt
   ```

3. **Configure environment**
   ```bash
   # Copy environment template
   cp env.example .env

   # Edit .env and add your OpenAI API key
   # OPENAI_API_KEY=your_openai_api_key_here
   ```

4. **Set up the map component (optional)**
   ```bash
   cd map
   npm install
   npm run build
   cd ..
   ```

### Running the Application

```bash
# Using the provided script
./scripts/run_dev.sh

# Or directly with uvicorn
uvicorn app.main:app --reload --port 8000
```

Visit `http://localhost:8000` in your browser.

On first run, the application will automatically create a local SQLite database (`lorekeeper.db`) in the project root.

## Project Structure

```
lorekeeper/
├── app/                    # FastAPI application
│   ├── ai/                # AI-powered modules
│   ├── core/              # Configuration and database
│   ├── crud/              # Database operations
│   ├── models/            # SQLModel definitions
│   ├── web/               # Web routes and templates
│   └── main.py            # Application entry point
├── map/                   # React/TypeScript map component
├── scripts/               # Development scripts
├── requirements.txt       # Python dependencies
├── env.example           # Environment variables template
└── README.md             # This file
```

## Development

### Backend Development

The backend uses FastAPI with SQLModel for type-safe database operations. Key modules:

- `app/ai/`: AI integration modules (OpenAI client, entity extraction, etc.)
- `app/crud/`: Database CRUD operations
- `app/models/`: Data models and schemas
- `app/web/`: Web routes and HTML templates

### Frontend Development

The main interface uses server-side rendered HTML with HTMX for dynamic interactions. The map component is a separate React application.

### Database

LoreKeeper uses SQLite for local data storage. The database schema is defined using SQLModel and automatically created on first run.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

[Add your license here]

## Support

For questions or issues, please [create an issue](https://github.com/yourusername/lorekeeper/issues) on GitHub.


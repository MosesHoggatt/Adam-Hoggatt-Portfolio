import Card from './Card'
import './App.css'

function App() {
  const cards = [
    { title: 'Project 1', image: '/placeholder1.jpg' },
    { title: 'Project 2', image: '/placeholder2.jpg' },
    { title: 'Project 3', image: '/placeholder3.jpg' },
    // Add more cards here
  ]

  return (
    <div className="app">
      <header className="header">
        <img src="/logo.png" alt="Logo" className="logo" />
      </header>
      <section className="about">
        <h2>About Me</h2>
        <p>
          As a Level Designer at Treyarch, my primary responsibility is gameplay design, and I have created many popular maps in the Call of Duty franchise with the help of many talented members of the Treyarch team. Though others have contributed to the design of many of these, and I have contributed to many others, this is a list of the maps I consider to be mostly (or all) my design work.
        </p>
      </section>
      <section className="projects">
        <h2>My Projects</h2>
        <div className="grid">
          {cards.map((card, index) => (
            <Card key={index} title={card.title} image={card.image} />
          ))}
        </div>
      </section>
    </div>
  )
}

export default App